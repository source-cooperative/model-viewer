<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Minus, Plus, Rotate3d } from "lucide-svelte";
  import {
    AbstractMesh,
    Animation,
    ArcRotateCamera,
    Color3,
    Color4,
    DirectionalLight,
    EasingFunction,
    Engine,
    HemisphericLight,
    Mesh,
    Observer,
    QuadraticEase,
    Scene,
    StandardMaterial,
    TransformNode,
    Vector3,
    VertexData
  } from "@babylonjs/core";
  import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
  import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
  import Button from "./Button.svelte";

  let { modelUrl }: { modelUrl: string } = $props();

  const ZOOM_STEP = 1.5;
  const ANIMATION_FRAME_RATE = 60;
  const ANIMATION_FRAMES = 20;

  const isObjSource = (url: string) => {
    return new URL(url).pathname.toLowerCase().endsWith(".obj");
  };

  const rebuildMesh = (mesh: AbstractMesh, scene: Scene) => {
    const positions = mesh.getVerticesData("position");
    const indices = mesh.getIndices();
    if (!positions || positions.length === 0 || !indices || indices.length === 0) {
      return null;
    }

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;

    const normals = mesh.getVerticesData("normal");
    if (normals && normals.length > 0) {
      vertexData.normals = normals;
    }

    const uvs = mesh.getVerticesData("uv");
    if (uvs && uvs.length > 0) {
      vertexData.uvs = uvs;
    }

    const colors = mesh.getVerticesData("color");
    if (colors && colors.length > 0) {
      vertexData.colors = colors;
    }

    const rebuilt = new Mesh(mesh.name, scene);
    vertexData.applyToMesh(rebuilt, false);
    rebuilt.position.copyFrom(mesh.position);
    rebuilt.scaling.copyFrom(mesh.scaling);
    if (mesh.rotationQuaternion) {
      rebuilt.rotationQuaternion = mesh.rotationQuaternion.clone();
    } else {
      rebuilt.rotation.copyFrom(mesh.rotation);
    }
    rebuilt.isVisible = mesh.isVisible;
    rebuilt.setEnabled(mesh.isEnabled());
    rebuilt.material = mesh.material;
    return rebuilt;
  };

  let canvasElement: HTMLCanvasElement;
  let engine: Engine | null = null;
  let scene: Scene | null = null;
  let camera: ArcRotateCamera | null = null;
  let modelRoot: TransformNode | null = null;
  let modelFlip: TransformNode | null = null;
  let renderMeshes: AbstractMesh[] = [];
  let handleResize: (() => void) | null = null;
  let zoomAnim: { stop: () => void } | null = null;
  let flipAnim: { stop: () => void } | null = null;
  let flipRecenterObserver: Observer<Scene> | null = null;

  let isFlipAnimating = false;
  let isDragging = $state(false);
  let isFlipped = $state(false);

  const getWorldBounds = (meshes: AbstractMesh[]) => {
    if (!meshes.length) return null;
    let min = new Vector3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY
    );
    let max = new Vector3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY
    );

    meshes.forEach((mesh) => {
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo({});
      const bounds = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, bounds.minimumWorld);
      max = Vector3.Maximize(max, bounds.maximumWorld);
    });

    return { min, max };
  };

  const recenterModel = () => {
    if (!modelRoot || !renderMeshes.length) return;
    const bounds = getWorldBounds(renderMeshes);
    if (!bounds) return;
    const center = Vector3.Center(bounds.min, bounds.max);
    if (center.lengthSquared() > 1e-6) {
      modelRoot.position.subtractInPlace(center);
      modelRoot.computeWorldMatrix(true);
    }
  };

  const flipModel = () => {
    if (!modelFlip || !scene) return;
    const currentScene = scene;
    const targetRotation = isFlipped ? Math.PI : 0;

    if (flipAnim) {
      flipAnim.stop();
    }
    if (flipRecenterObserver) {
      currentScene.onBeforeRenderObservable.remove(flipRecenterObserver);
      flipRecenterObserver = null;
    }

    const flipAnimation = new Animation(
      "modelFlip",
      "rotation.x",
      ANIMATION_FRAME_RATE,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    flipAnimation.setKeys([
      { frame: 0, value: modelFlip.rotation.x },
      { frame: ANIMATION_FRAMES, value: targetRotation }
    ]);

    const easing = new QuadraticEase();
    easing.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    flipAnimation.setEasingFunction(easing);

    isFlipAnimating = true;
    flipRecenterObserver = currentScene.onBeforeRenderObservable.add(() => {
      if (isFlipAnimating) {
        recenterModel();
      }
    });

    flipAnim = currentScene.beginDirectAnimation(
      modelFlip,
      [flipAnimation],
      0,
      ANIMATION_FRAMES,
      false,
      1,
      () => {
        isFlipAnimating = false;
        if (flipRecenterObserver) {
          currentScene.onBeforeRenderObservable.remove(flipRecenterObserver);
          flipRecenterObserver = null;
        }
        modelFlip?.computeWorldMatrix(true);
        recenterModel();
      }
    );
  };

  const zoom = (zoomIn: boolean) => {
    if (!camera || !scene) return;
    const factor = 1 + ZOOM_STEP;
    const targetRadius = zoomIn === true ? camera.radius / factor : camera.radius * factor;
    const min = camera.lowerRadiusLimit ?? 0.01;
    const max = camera.upperRadiusLimit ?? Number.POSITIVE_INFINITY;
    const clampedRadius = Math.min(max, Math.max(min, targetRadius));

    if (zoomAnim) {
      zoomAnim.stop();
    }

    const zoomAnimation = new Animation(
      "cameraZoom",
      "radius",
      ANIMATION_FRAME_RATE,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    zoomAnimation.setKeys([
      { frame: 0, value: camera.radius },
      { frame: ANIMATION_FRAMES, value: clampedRadius }
    ]);

    const easing = new QuadraticEase();
    easing.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    zoomAnimation.setEasingFunction(easing);

    zoomAnim = scene.beginDirectAnimation(camera, [zoomAnimation], 0, ANIMATION_FRAMES, false);
  };

  onMount(async () => {
    if (!canvasElement || !modelUrl) return;

    try {
      registerBuiltInLoaders();

      engine = new Engine(canvasElement, true, {
        preserveDrawingBuffer: true,
        stencil: true
      });

      scene = new Scene(engine);
      scene.clearColor = new Color4(0.067, 0.067, 0.067, 0);

      camera = new ArcRotateCamera(
        "camera",
        -Math.PI / 2,
        Math.PI / 2.5,
        10,
        Vector3.Zero(),
        scene
      );
      camera.attachControl(canvasElement, true);
      camera.setTarget(Vector3.Zero());
      camera.lowerRadiusLimit = 0.1;
      camera.upperRadiusLimit = 1000;
      camera.wheelDeltaPercentage = 0.01;
      camera.panningSensibility = 0;
      scene.activeCamera = camera;

      const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
      const dirLight = new DirectionalLight("dirLight", new Vector3(-1, -1, -1), scene);
      light.intensity = 1.0;
      dirLight.intensity = 0.5;

      engine.runRenderLoop(() => {
        if (scene) {
          scene.render();
        }
      });

      const assetContainer = await LoadAssetContainerAsync(modelUrl, scene);
      if (!assetContainer) {
        throw new Error("Failed to load asset container");
      }
      assetContainer.addAllToScene();

      const objSource = isObjSource(modelUrl);
      const meshes = assetContainer.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
      const rebuiltMeshes: AbstractMesh[] = [];

      meshes.forEach((mesh: AbstractMesh, index: number) => {
        let targetMesh: AbstractMesh = mesh;
        if (objSource && scene) {
          const rebuiltMesh = rebuildMesh(mesh, scene);
          if (rebuiltMesh) {
            mesh.dispose(false, true);
            targetMesh = rebuiltMesh;
          }
        }
        rebuiltMeshes.push(targetMesh);

        targetMesh.setEnabled(true);
        targetMesh.isVisible = true;

        if (!targetMesh.material && scene) {
          const defaultMat = new StandardMaterial(`defaultMat_${index}`, scene);
          defaultMat.diffuseColor = new Color3(0.8, 0.8, 0.8);
          targetMesh.material = defaultMat;
        }
      });

      renderMeshes = objSource ? rebuiltMeshes : meshes;

      if (renderMeshes.length > 0) {
        modelRoot = new TransformNode("modelRoot", scene);
        modelFlip = new TransformNode("modelFlip", scene);
        modelFlip.setParent(modelRoot);
        renderMeshes.forEach((m) => m.setParent(modelFlip, true, true));
        modelRoot.computeWorldMatrix(true);
        const preBounds = getWorldBounds(renderMeshes);
        if (!preBounds) {
          throw new Error("Failed to compute model bounds");
        }
        const size = preBounds.max.subtract(preBounds.min);
        const maxDimension = Math.max(size.x, size.y, size.z);

        if (maxDimension > 0) {
          const desiredSize = 10;
          const scale = desiredSize / maxDimension;

          modelRoot.scaling = new Vector3(scale, scale, scale);
          modelRoot.position = Vector3.Zero();
          flipModel();
          modelRoot.computeWorldMatrix(true);

          const postBounds = getWorldBounds(renderMeshes);
          if (!postBounds) {
            throw new Error("Failed to compute model bounds");
          }
          const postSize = postBounds.max.subtract(postBounds.min);
          const postMaxDimension = Math.max(postSize.x, postSize.y, postSize.z);

          camera.useFramingBehavior = false;
          camera.setTarget(Vector3.Zero());

          const radius = Math.max(postMaxDimension * 1.5, 3);
          camera.radius = radius;
          camera.alpha = -Math.PI / 2;
          camera.beta = Math.PI / 2.5;

          const upperLimit = Math.max(radius * 2.5, radius + 5);
          camera.lowerRadiusLimit = 0.5;
          camera.upperRadiusLimit = upperLimit;
          camera.minZ = 0.01;
          camera.maxZ = camera.upperRadiusLimit * 5;
        } else {
          flipModel();
          camera.setTarget(Vector3.Zero());
          camera.radius = 10;
        }
      } else {
        console.warn("No renderable meshes found (0 vertices)");
        camera.setTarget(Vector3.Zero());
        camera.radius = 10;
      }

      handleResize = () => {
        if (engine) {
          engine.resize();
        }
      };
      window.addEventListener("resize", handleResize);
    } catch (error) {
      console.error("Error loading model:", error);
    }
  });

  onDestroy(() => {
    if (handleResize) {
      window.removeEventListener("resize", handleResize);
    }
    if (camera) {
      camera.detachControl();
    }
    if (scene && flipRecenterObserver) {
      scene.onBeforeRenderObservable.remove(flipRecenterObserver);
      flipRecenterObserver = null;
    }
    if (engine) {
      engine.dispose();
    }
    if (scene) {
      scene.dispose();
    }
  });
</script>

<div class="relative w-full h-full">
  <div id="toolbar" class="absolute top-0 left-0 z-1 flex flex-col m-2 gap-1">
    <Button icon={Plus} onclick={() => zoom(true)} title="Zoom in" />
    <Button icon={Minus} onclick={() => zoom(false)} title="Zoom out" />
    <Button
      icon={Rotate3d}
      onclick={() => {
        isFlipped = !isFlipped;
        flipModel();
      }}
      title="Flip model on axis"
    />
  </div>

  <canvas
    bind:this={canvasElement}
    class="model-viewer-canvas block w-full h-full bg-source-950"
    class:cursor-grab={!isDragging}
    class:cursor-grabbing={isDragging}
    onpointerdown={() => (isDragging = true)}
    onpointerup={() => (isDragging = false)}
    onpointerleave={() => (isDragging = false)}
    onpointercancel={() => (isDragging = false)}
  ></canvas>
</div>
