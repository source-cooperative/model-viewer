# model-viewer

A simple web app to display a remote 3D model file. Supported formats include GLB, GLTF, OBJ, and STL. Maximum allowed file size is 200 MB.

Uses [Babylon.js](https://www.babylonjs.com) to display meshes.

## How to use

When the app is running, submit a valid remote model URL via query parameter `url`. For example:

```
/?url=https://data.source.coop/harvard-lil/smithsonian-open-access/3d/009463d3-6f58-4f5b-8e60-915805a876ee/USNM_91201-150k-1024-low.glb
```

Once the image loads, use the built-in controls to zoom, rotate the image, or enter full screen mode.

## Development setup

```sh
# Install dependencies
npm install

# Run development server
npm run dev

# Build production website
npm run build
```
