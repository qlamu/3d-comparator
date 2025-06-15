// Three.js script for 3D object comparator
let scene, camera, renderer, controls;
let objects = [];
let alignmentAxis = 'x'; // 'x' for front alignment, 'z' for side alignment

// Debounce function to limit the rate at which a function can fire
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

function init() {
    // Create the scene
    scene = new THREE.Scene();

    // Set scene background based on color scheme
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const sceneBackgroundColor = prefersDarkScheme.matches ? 0x1a1a1a : 0xf3f4f6;
    scene.background = new THREE.Color(sceneBackgroundColor);

    // Listen for changes in color scheme preference
    prefersDarkScheme.addEventListener('change', e => {
        const newColor = e.matches ? 0x1a1a1a : 0xf3f4f6;
        scene.background = new THREE.Color(newColor);
    });

    // Create the camera with a large far plane
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10000);

    // Set initial camera position
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);

    // Create the renderer
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('canvas'),
        antialias: true
    });

    // Function to resize canvas
    function resizeCanvas() {
        const container = document.getElementById('canvasContainer');
        const width = container.clientWidth;

        if (width === 0) return;

        let aspectRatio;
        if (window.innerWidth <= 768) {
            // Mobile: 9:16 aspect ratio (portrait)
            aspectRatio = 9 / 16;
        } else {
            // Desktop: 16:9 aspect ratio (landscape)
            aspectRatio = 16 / 9;
        }

        const height = width / aspectRatio;
        container.style.height = `${height}px`;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        if (objects.length > 0) {
            centerCamera();
        }
    }

    // Use debounce for resize and orientationchange events
    window.addEventListener('resize', debounce(resizeCanvas, 250), false);
    window.addEventListener('orientationchange', debounce(resizeCanvas, 250), false);

    resizeCanvas();

    // Add orbit controls for mouse interaction
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.target.set(0, 0, 0);

    const nameInput = document.getElementById('name');
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');
    const lengthInput = document.getElementById('length');
    const colorInput = document.getElementById('color');
    const colorHexInput = document.getElementById('colorHex');
    const addButton = document.getElementById('addObject');

    function validateForm() {
        const isNameValid = nameInput.checkValidity();
        const isWidthValid = widthInput.checkValidity();
        const isHeightValid = heightInput.checkValidity();
        const isLengthValid = lengthInput.checkValidity();
        const isColorHexValid = colorHexInput.checkValidity();

        addButton.disabled = !(isNameValid && isWidthValid && isHeightValid && isLengthValid && isColorHexValid);
    }

    // Add event listeners to all inputs to trigger validation
    nameInput.addEventListener('input', validateForm);
    widthInput.addEventListener('input', validateForm);
    heightInput.addEventListener('input', validateForm);
    lengthInput.addEventListener('input', validateForm);
    colorHexInput.addEventListener('input', validateForm);

    // Sync color picker and hex input
    colorInput.addEventListener('input', function() {
        colorHexInput.value = this.value;
        validateForm();
    });

    // Update color picker when hex input changes, if valid
    colorHexInput.addEventListener('input', function() {
        if (colorHexInput.checkValidity()) {
            colorInput.value = this.value;
        }
    });

    // Initial validation
    validateForm();

    // Load configuration from URL
    loadConfigFromURL();

    // Start the animation loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function calculateBoundingBox() {
    if (objects.length === 0) {
        return {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 0, y: 0, z: 0 },
            center: { x: 0, y: 0, z: 0 },
            size: { x: 0, y: 0, z: 0 }
        };
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    objects.forEach(obj => {
        const mesh = obj.mesh;
        const width = obj.width;
        const height = obj.height;
        const length = obj.length;

        const x = mesh.position.x;
        const y = mesh.position.y;
        const z = mesh.position.z;

        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const halfLength = length / 2;

        minX = Math.min(minX, x - halfWidth);
        maxX = Math.max(maxX, x + halfWidth);
        minY = Math.min(minY, y - halfHeight);
        maxY = Math.max(maxY, y + halfHeight);
        minZ = Math.min(minZ, z - halfLength);
        maxZ = Math.max(maxZ, z + halfLength);
    });

    const center = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2
    };

    const size = {
        x: maxX - minX,
        y: maxY - minY,
        z: maxZ - minZ
    };

    return {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        center: center,
        size: size
    };
}

function fitToView(direction) {
    const bbox = calculateBoundingBox();
    const center = bbox.center;
    const size = bbox.size;
    
    // Get both canvas dimensions
    const canvasWidth = renderer.domElement.width;
    const canvasHeight = renderer.domElement.height;
    const aspect = canvasWidth / canvasHeight;
    
    // Desired size as percentage of viewport (adjustable)
    const desiredScreenCoverage = 0.6;
    
    const fov = camera.fov * Math.PI / 180;
    const fovX = 2 * Math.atan(Math.tan(fov / 2) * aspect); // Horizontal FOV
    
    let distance;
    
    switch (direction) {
        case 'front': {
            // For front view, consider width and height of object
            const objWidth = size.x;
            const objHeight = size.y;
            
            // Calculate distance needed for both dimensions
            const distanceForWidth = objWidth / (2 * Math.tan(fovX / 2) * desiredScreenCoverage);
            const distanceForHeight = objHeight / (2 * Math.tan(fov / 2) * desiredScreenCoverage);
            
            // Use the larger distance to ensure object fits
            distance = Math.max(distanceForWidth, distanceForHeight);
            break;
        }
        case 'top': {
            const objWidth = size.x;
            const objDepth = size.z;
            
            const distanceForWidth = objWidth / (2 * Math.tan(fovX / 2) * desiredScreenCoverage);
            const distanceForDepth = objDepth / (2 * Math.tan(fov / 2) * desiredScreenCoverage);
            
            distance = Math.max(distanceForWidth, distanceForDepth);
            break;
        }
        case 'side': {
            const objDepth = size.z;
            const objHeight = size.y;
            
            const distanceForDepth = objDepth / (2 * Math.tan(fovX / 2) * desiredScreenCoverage);
            const distanceForHeight = objHeight / (2 * Math.tan(fov / 2) * desiredScreenCoverage);
            
            distance = Math.max(distanceForDepth, distanceForHeight);
            break;
        }
        case 'isometric': {
            // For isometric, we need to consider the projected size
            // This is more complex as it depends on the viewing angle
            const objWidth = size.x;
            const objHeight = size.y;
            const objDepth = size.z;
            
            // Simplified approach: use diagonal size with some padding
            const diagonalSize = Math.sqrt(objWidth * objWidth + objHeight * objHeight + objDepth * objDepth);
            
            const distanceForWidth = diagonalSize / (2 * Math.tan(fovX / 2) * desiredScreenCoverage);
            const distanceForHeight = diagonalSize / (2 * Math.tan(fov / 2) * desiredScreenCoverage);
            
            distance = Math.max(distanceForWidth, distanceForHeight) * 0.8; // Slightly closer for better framing
            break;
        }
        default: {
            // Default case - fit entire bounding box
            const maxDim = Math.max(size.x, size.y, size.z);
            
            const distanceForWidth = maxDim / (2 * Math.tan(fovX / 2) * desiredScreenCoverage);
            const distanceForHeight = maxDim / (2 * Math.tan(fov / 2) * desiredScreenCoverage);
            
            distance = Math.max(distanceForWidth, distanceForHeight);
        }
    }
    
    // Position camera based on direction
    const target = new THREE.Vector3(center.x, center.y, center.z);
    let position;
    
    switch (direction) {
        case 'front':
            position = new THREE.Vector3(center.x, center.y, center.z + distance);
            break;
        case 'top':
            position = new THREE.Vector3(center.x, center.y + distance, center.z);
            break;
        case 'side':
            position = new THREE.Vector3(center.x + distance, center.y, center.z);
            break;
        case 'isometric':
            // Normalize the isometric direction
            const isoDir = new THREE.Vector3(1, 1, 1).normalize();
            position = new THREE.Vector3(
                center.x + isoDir.x * distance,
                center.y + isoDir.y * distance,
                center.z + isoDir.z * distance
            );
            break;
        default:
            position = new THREE.Vector3(center.x, center.y, center.z + distance);
    }
    
    // Apply camera position and target
    camera.position.set(position.x, position.y, position.z);
    controls.target.set(target.x, target.y, target.z);
    controls.update();
}

function setFrontView() {
    fitToView('front');
}

function setTopView() {
    fitToView('top');
}

function setSideView() {
    fitToView('side');
}

function setIsometricView() {
    fitToView('isometric');
}

function centerCamera() {
    fitToView('front');
}

function repositionObjects() {
    const gap = 1;
    let currentPos = 0;

    objects.forEach(obj => {
        const yPos = obj.height / 2;
        const zPos = obj.length / 2;

        if (alignmentAxis === 'x') {
            const xPos = currentPos + obj.width / 2;
            obj.mesh.position.set(xPos, yPos, zPos);
            currentPos += obj.width + gap;
        } else if (alignmentAxis === 'z') {
            const xPosForSide = obj.width / 2;
            const zPosForSide = currentPos + obj.length / 2;
            obj.mesh.position.set(xPosForSide, yPos, zPosForSide);
            currentPos += obj.length + gap;
        }
    });
}

function setAlignFront() {
    alignmentAxis = 'x';
    repositionObjects();
    fitToView('front');
}

function setAlignSide() {
    alignmentAxis = 'z';
    repositionObjects();
    fitToView('side');
}

function addObject(name, width, height, length, color, id = null) {
    const objectId = id || Date.now().toString();
    const geometry = new THREE.BoxGeometry(width, height, length);
    const material = new THREE.MeshBasicMaterial({ color: color });
    const cube = new THREE.Mesh(geometry, material);

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    cube.add(line);

    scene.add(cube);

    objects.push({
        id: objectId,
        mesh: cube,
        name: name,
        width: width,
        height: height,
        length: length,
        color: color
    });

    repositionObjects();
    updateObjectsList();
    centerCamera();
    updateURL();
}

function updateObjectsList() {
    const objectsList = document.getElementById('objectsList');
    objectsList.innerHTML = '';

    if (objects.length === 0) {
        objectsList.innerHTML = '<div class="text-gray-500 dark:text-gray-400 text-sm">No objects added yet</div>';
        return;
    }

    objects.forEach((obj) => {
        const chip = document.createElement('div');
        chip.className = 'cursor-grab flex items-center bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1 pr-1 group hover:bg-gray-200 dark:hover:bg-gray-600 transition';
        chip.setAttribute('data-id', obj.id); // Use ID instead of index

        // Color indicator
        const colorIndicator = document.createElement('span');
        colorIndicator.className = 'w-3 h-3 rounded-full mr-2';
        colorIndicator.style.backgroundColor = obj.color;

        // Name and dimensions
        const infoSpan = document.createElement('span');
        infoSpan.className = 'mr-1';
        infoSpan.innerHTML = `
            <span class="font-medium text-gray-800 dark:text-gray-200">${obj.name}</span>
            <span class="text-xs text-gray-600 dark:text-gray-400 ml-1">${obj.width}×${obj.height}×${obj.length}</span>
        `;

        // Remove button
        const removeButton = document.createElement('button');
        removeButton.className = 'ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition text-lg leading-none';
        removeButton.innerHTML = '×';
        removeButton.onclick = (e) => {
            e.stopPropagation();
            removeObject(obj.id); // Pass ID instead of index
        };

        chip.appendChild(colorIndicator);
        chip.appendChild(infoSpan);
        chip.appendChild(removeButton);
        objectsList.appendChild(chip);
    });

    // Initialize or update Sortable
    initializeSortable();
}

function removeObject(idOrIndex) {
    let indexToRemove;

    // If it's an index (number), find the ID first
    if (typeof idOrIndex === 'number') {
        const obj = objects[idOrIndex];
        if (obj) {
            indexToRemove = objects.findIndex(o => o.id === obj.id);
        }
    } else {
        // It's already an ID
        indexToRemove = objects.findIndex(o => o.id === idOrIndex);
    }

    if (indexToRemove !== -1) {
        scene.remove(objects[indexToRemove].mesh);
        objects.splice(indexToRemove, 1);
        updateObjectsList();
        repositionObjects();
        centerCamera();
        updateURL();
    }
}

function initializeSortable() {
    const objectsList = document.getElementById('objectsList');

    // Destroy previous instance if it exists
    if (window.sortable) {
        window.sortable.destroy();
    }

    window.sortable = Sortable.create(objectsList, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function(evt) {
            // Get all chip elements in their new order
            const chips = objectsList.querySelectorAll('div[data-id]');
            const newOrderIds = Array.from(chips).map(chip => chip.getAttribute('data-id'));

            // Create a mapping from id to object
            const idToObject = {};
            objects.forEach(obj => {
                idToObject[obj.id] = obj;
            });

            // Rebuild the objects array in the new order
            const newObjects = [];
            newOrderIds.forEach(id => {
                if (idToObject[id]) {
                    newObjects.push(idToObject[id]);
                }
            });

            // Replace the old objects array with the new one
            objects.length = 0;
            objects.push(...newObjects);

            // Reposition the objects based on the new order
            repositionObjects();

            // Update the URL to reflect the new order
            updateURL();
        }
    });
}

function updateURL() {
    const config = {
        objects: objects.map(obj => ({
            id: obj.id,
            name: obj.name,
            width: obj.width,
            height: obj.height,
            length: obj.length,
            color: obj.color
        }))
    };
    const configString = JSON.stringify(config);
    const encodedConfig = encodeURIComponent(configString);

    // Parse the current hash (without the leading #)
    const currentHash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(currentHash);

    // Set or update the config parameter
    hashParams.set('config', encodedConfig);

    // Convert back to a hash string
    const newHash = hashParams.toString();

    // Update the URL with the new hash, preserving path and query
    const baseUrl = `${window.location.pathname}${window.location.search}`;
    const newUrl = `${baseUrl}#${newHash}`;
    history.replaceState({}, '', newUrl);
}

function loadConfigFromURL() {
    const hash = window.location.hash.substring(1); // Remove the leading #
    const hashParams = new URLSearchParams(hash);
    const encodedConfig = hashParams.get('config');
    if (encodedConfig) {
        try {
            const configString = decodeURIComponent(encodedConfig);
            const config = JSON.parse(configString);
            if (config.objects) {
                while (objects.length > 0) {
                    removeObject(0);
                }
                config.objects.forEach(objConfig => {
                    addObject(
                        objConfig.name || 'Object',
                        objConfig.width,
                        objConfig.height,
                        objConfig.length,
                        objConfig.color,
                        objConfig.id
                    );
                });
            }
        } catch (e) {
            console.error("Error loading config from URL:", e);
        }
    }
}

// Event listeners
document.getElementById('addObject').addEventListener('click', () => {
    const name = document.getElementById('name').value || 'Object';
    const width = Math.max(0.1, parseFloat(document.getElementById('width').value.trim()) || 1);
    const height = Math.max(0.1, parseFloat(document.getElementById('height').value.trim()) || 1);
    const length = Math.max(0.1, parseFloat(document.getElementById('length').value.trim()) || 1);
    const color = document.getElementById('color').value;

    addObject(name, width, height, length, color);

    // Reset form fields to defaults after adding
    document.getElementById('name').value = '';
    document.getElementById('width').value = '';
    document.getElementById('height').value = '';
    document.getElementById('length').value = '';
    document.getElementById('color').value = '#00ff00';
    document.getElementById('colorHex').value = '#00ff00';
});

// Add clear all functionality
document.getElementById('clearAll').addEventListener('click', () => {
    while (objects.length > 0) {
        removeObject(0);
    }
});

document.getElementById('frontView').addEventListener('click', setFrontView);
document.getElementById('topView').addEventListener('click', setTopView);
document.getElementById('sideView').addEventListener('click', setSideView);
document.getElementById('isometricView').addEventListener('click', setIsometricView);
document.getElementById('alignFront').addEventListener('click', setAlignFront);
document.getElementById('alignSide').addEventListener('click', setAlignSide);

// Initialize the scene
init();
