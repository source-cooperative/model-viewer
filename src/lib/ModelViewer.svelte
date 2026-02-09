<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Maximize2, Minimize2, Minus, Plus } from "lucide-svelte";
  import {
    AbstractMesh,
    Animation,
    ArcRotateCamera,
    Camera,
    Color3,
    Color4,
    EasingFunction,
    Engine,
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

  let containerElement: HTMLDivElement;
  let canvasElement: HTMLCanvasElement;
  let isFullScreen = $state(false);
  let engine: Engine | null = null;
  let scene: Scene | null = null;
  let camera: ArcRotateCamera | null = null;
  let modelRoot: TransformNode | null = null;
  let renderMeshes: AbstractMesh[] = [];
  let handleResize: (() => void) | null = null;
  let zoomAnim: { stop: () => void } | null = null;
  let cameraViewObserver: Observer<Camera> | null = null;
  let isDragging = $state(false);

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

  const getHierarchyBounds = (root: TransformNode) => {
    const { min, max } = root.getHierarchyBoundingVectors(true);
    return { min, max };
  };

  const recenterModel = () => {
    if (!modelRoot) return;
    const bounds = getHierarchyBounds(modelRoot);
    const center = Vector3.Center(bounds.min, bounds.max);
    if (center.lengthSquared() > 1e-6) {
      modelRoot.position.subtractInPlace(center);
      modelRoot.computeWorldMatrix(true);
    }
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

  const toggleFullScreen = () => {
    if (!containerElement) return;
    if (isFullScreen) {
      isFullScreen = false;
      document.exitFullscreen();
    } else {
      isFullScreen = true;
      containerElement.requestFullscreen();
    }
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
      camera.lowerAlphaLimit = null;
      camera.upperAlphaLimit = null;
      camera.lowerBetaLimit = null;
      camera.upperBetaLimit = null;
      camera.allowUpsideDown = true;
      camera.wheelDeltaPercentage = 0;
      camera.wheelPrecision = 500;
      camera.panningSensibility = 0;
      scene.activeCamera = camera;

      scene.createDefaultLight();
      const defaultLight = scene.lights[scene.lights.length - 1];
      if (defaultLight && "direction" in defaultLight) {
        const lightWithDirection = defaultLight as { direction: Vector3 };
        const localDir = lightWithDirection.direction.clone();
        const activeCamera = camera;
        cameraViewObserver = activeCamera.onViewMatrixChangedObservable.add(() => {
          lightWithDirection.direction = activeCamera.getDirection(localDir);
        });
      }

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
        renderMeshes.forEach((m) => m.setParent(modelRoot, true, true));
        modelRoot.computeWorldMatrix(true);
        recenterModel();

        const bounds = getHierarchyBounds(modelRoot);
        const size = bounds.max.subtract(bounds.min);
        const maxDimension = Math.max(size.x, size.y, size.z);

        camera.useFramingBehavior = true;
        camera.setTarget(Vector3.Zero());
        camera.zoomOn(renderMeshes);
        camera.alpha = -Math.PI / 2;
        camera.beta = Math.PI / 2.5;

        const fallbackRadius = Math.max(maxDimension * 1.5, 3);
        const radius = Number.isFinite(camera.radius) ? camera.radius : fallbackRadius;
        const minRadius = Math.max(maxDimension * 0.02, 0.01);
        const maxRadius = Math.max(maxDimension * 3, minRadius * 3);
        const clampedRadius = Math.min(Math.max(radius, minRadius), maxRadius);

        camera.radius = clampedRadius;
        camera.lowerRadiusLimit = minRadius;
        camera.upperRadiusLimit = maxRadius;
        camera.minZ = 0.01;
        camera.maxZ = camera.upperRadiusLimit * 5;
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
      if (cameraViewObserver) {
        camera.onViewMatrixChangedObservable.remove(cameraViewObserver);
      }
      camera.detachControl();
    }
    if (engine) {
      engine.dispose();
    }
    if (scene) {
      scene.dispose();
    }
  });
</script>

<div bind:this={containerElement} class="relative w-full h-full">
  <div id="toolbar" class="absolute top-0 left-0 z-1 flex flex-col m-2 gap-1">
    <Button icon={Plus} onclick={() => zoom(true)} title="Zoom in" />
    <Button icon={Minus} onclick={() => zoom(false)} title="Zoom out" />
    <Button
      icon={isFullScreen ? Minimize2 : Maximize2}
      onclick={toggleFullScreen}
      title="Toggle full screen"
    />
  </div>

  <canvas
    bind:this={canvasElement}
    class="model-viewer-canvas block w-full h-full bg-source-950 touch-none"
    class:cursor-grab={!isDragging}
    class:cursor-grabbing={isDragging}
    onpointerdown={() => (isDragging = true)}
    onpointerup={() => (isDragging = false)}
    onpointerleave={() => (isDragging = false)}
    onpointercancel={() => (isDragging = false)}
  ></canvas>
</div>
