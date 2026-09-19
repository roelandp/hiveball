// public/globe.js
let scene, camera, renderer, globe, arcLine, ballMesh;
let animationReq;

window.initGlobe = function(container, fromLat, fromLon, toLat, toLon, splash, onComplete) {
  if (!window.THREE) return;
  if (!scene) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    const geometry = new THREE.SphereGeometry(1, 32, 32);
    globe = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color: 0x1E90FF })); 
    const texLoader = new THREE.TextureLoader();
    texLoader.load('earth-2048.jpg', (tex) => { globe.material.map = tex; globe.material.color.set(0xffffff); globe.material.needsUpdate = true; });
    scene.add(globe);

    const ballGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const ballMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    ballMesh = new THREE.Mesh(ballGeo, ballMat);
    scene.add(ballMesh);
  } else {
    if (arcLine) scene.remove(arcLine);
  }
  
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();

  const fromPos = latLonToVector3(fromLat, fromLon, 1);
  const toPos = latLonToVector3(toLat, toLon, 1);

  camera.position.copy(fromPos).multiplyScalar(2.5);
  camera.lookAt(globe.position);
  
  const points = [];
  for(let i=0; i<=100; i++) {
    const t = i/100;
    const pos = new THREE.Vector3().copy(fromPos).lerp(toPos, t).normalize();
    const h = 1 + Math.sin(t * Math.PI) * 0.2; 
    pos.multiplyScalar(h);
    points.push(pos);
  }
  
  const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
  const arcMat = new THREE.LineBasicMaterial({ color: 0xffaa00, linewidth: 2 });
  arcLine = new THREE.Line(arcGeo, arcMat);
  scene.add(arcLine);
  
  const startTime = performance.now();
  const dur = 3000;
  
  function animate(time) {
    animationReq = requestAnimationFrame(animate);
    const elapsed = time - startTime;
    let t = elapsed / dur;
    if (t > 1) t = 1;
    
    // Slerp approximation for camera and ball
    const camPos = new THREE.Vector3().copy(fromPos).lerp(toPos, t).normalize().multiplyScalar(2.5);
    camera.position.copy(camPos);
    camera.lookAt(globe.position);

    const bPos = new THREE.Vector3().copy(fromPos).lerp(toPos, t).normalize();
    bPos.multiplyScalar(1 + Math.sin(t * Math.PI) * 0.2);
    if (t === 1 && splash) {
      // Sink into sea
      bPos.multiplyScalar(0.95);
    }
    ballMesh.position.copy(bPos);
    
    renderer.render(scene, camera);
    
    if (t === 1) {
      cancelAnimationFrame(animationReq);
      if (onComplete) onComplete();
    }
  }
  animate(performance.now());
}

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}
