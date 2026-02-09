<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Maximize2, Minimize2, Minus, Plus } from "lucide-svelte";
  import {
    AbstractMesh,
    Animation,
    ArcRotateCamera,
    Camera,
    Color4,
    EasingFunction,
    Engine,
    Mesh,
    Observer,
    QuadraticEase,
    Scene,
    Vector3
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
  let renderMeshes: AbstractMesh[] = [];
  let handleResize: (() => void) | null = null;
  let zoomAnim: { stop: () => void } | null = null;
  let cameraViewObserver: Observer<Camera> | null = null;
  let isDragging = $state(false);

  const isObjSource = (url: string) => {
    return new URL(url).pathname.toLowerCase().endsWith(".obj");
  };

  const rebuildMesh = (mesh: AbstractMesh) => {
    if (!(mesh instanceof Mesh)) {
      return null;
    }
    if (!mesh.geometry) {
      return null;
    }
    mesh.makeGeometryUnique();
    return mesh;
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

      scene.createDefaultCameraOrLight(true, true, true);
      camera = scene.activeCamera as ArcRotateCamera | null;
      if (!camera) {
        throw new Error("Failed to create default camera");
      }
      camera.attachControl(canvasElement, true);
      camera.setTarget(Vector3.Zero());
      camera.wheelDeltaPercentage = 0.01;
      camera.wheelPrecision = 100;
      camera.lowerBetaLimit = null;
      camera.upperBetaLimit = null;
      camera.panningSensibility = 0;
      camera.allowUpsideDown = true;
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
        if (objSource) {
          const rebuiltMesh = rebuildMesh(mesh);
          if (rebuiltMesh) {
            targetMesh = rebuiltMesh;
          }
        }
        rebuiltMeshes.push(targetMesh);

        targetMesh.setEnabled(true);
        targetMesh.isVisible = true;

      });

      renderMeshes = objSource ? rebuiltMeshes : meshes;

      if (renderMeshes.length > 0) {
        camera.useFramingBehavior = true;
        camera.setTarget(Vector3.Zero());
        camera.zoomOn(renderMeshes);
        camera.alpha = -Math.PI / 2;
        camera.beta = Math.PI / 2.5;
        camera.upperRadiusLimit = camera.radius * 3;
        camera.minZ = 0.01;
        camera.maxZ = camera.radius * 5;
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
    ondblclick={(event) => zoom(!event.shiftKey)}
    onpointerdown={() => (isDragging = true)}
    onpointerup={() => (isDragging = false)}
    onpointerleave={() => (isDragging = false)}
    onpointercancel={() => (isDragging = false)}
  ></canvas>
</div>
