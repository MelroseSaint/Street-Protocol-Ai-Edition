import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PhysicsWorld } from './engine/Physics';
import { WorldManager } from './game/World';
import { Player, Car, Pedestrian } from './game/GameEntities';
import { CameraRig } from './game/CameraRig';
import { ControlMode, InputState, CameraMode, VehicleConfig } from './types';
import { SoundManager } from './utils/assets';
import { InputManager } from './utils/InputManager';

const CAR_SPORT: VehicleConfig = {
    name: 'Neon Blade',
    mass: 1400,
    enginePower: 18000,
    brakeForce: 450,
    maxRPM: 9000,
    drag: 0.3,
    suspensionLength: 0.4,
    suspensionStiffness: 60000,
    suspensionDamping: 5000,
    frictionLat: 20.0,
    frictionLong: 18.0,
    turnSpeed: 1.2,
    wheelRadius: 0.33,
    width: 1.9,
    length: 4.4,
    height: 1.2,
    color: 0xff0055, 
    type: 'sport'
};

const CAR_TRUCK: VehicleConfig = {
    name: 'Goliath',
    mass: 2800,
    enginePower: 25000,
    brakeForce: 600,
    maxRPM: 5000,
    drag: 0.6,
    suspensionLength: 0.6,
    suspensionStiffness: 80000,
    suspensionDamping: 6000,
    frictionLat: 15.0,
    frictionLong: 15.0,
    turnSpeed: 0.8,
    wheelRadius: 0.5,
    width: 2.2,
    length: 5.5,
    height: 2.0,
    color: 0x224488,
    type: 'truck'
};

const CAR_SEDAN: VehicleConfig = {
    name: 'Executive',
    mass: 1600,
    enginePower: 14000,
    brakeForce: 350,
    maxRPM: 7000,
    drag: 0.35,
    suspensionLength: 0.5,
    suspensionStiffness: 45000,
    suspensionDamping: 3500,
    frictionLat: 16.0,
    frictionLong: 16.0,
    turnSpeed: 1.0,
    wheelRadius: 0.35,
    width: 1.8,
    length: 4.6,
    height: 1.4,
    color: 0x111111,
    type: 'sedan'
};

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [debug, setDebug] = useState({ speed: 0, fps: 0, mode: 'WALK' });
  const [msg, setMsg] = useState('Loading Assets... Click to Capture Mouse');

  const engineRef = useRef<any>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Setup Three.js
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0; // Brighter
    mountRef.current.appendChild(renderer.domElement);

    // Systems
    const inputMgr = new InputManager(renderer.domElement);
    const soundMgr = new SoundManager();
    const physics = new PhysicsWorld();
    const world = new WorldManager(scene, physics);
    const cameraRig = new CameraRig(camera);

    // Entities
    const player = new Player(new THREE.Vector3(0, 5, 0));
    scene.add(player.mesh);
    physics.addBody(player.body);

    const cars: Car[] = [];
    
    // Spawn Sport Car
    const c1 = new Car('car1', new THREE.Vector3(10, 2, 10), CAR_SPORT, soundMgr);
    scene.add(c1.mesh);
    physics.addBody(c1.body);
    cars.push(c1);
    
    // Spawn Truck
    const c2 = new Car('car2', new THREE.Vector3(-15, 2, 5), CAR_TRUCK, soundMgr);
    scene.add(c2.mesh);
    physics.addBody(c2.body);
    cars.push(c2);

    // Spawn Sedan
    const c3 = new Car('car3', new THREE.Vector3(5, 2, -20), CAR_SEDAN, soundMgr);
    scene.add(c3.mesh);
    physics.addBody(c3.body);
    cars.push(c3);

    engineRef.current = { scene, camera, renderer, physics, world, player, cars, currentCar: null, cameraRig, inputMgr };
    setMsg("WASD Move | CLICK Shoot | E Enter Car | V Camera | SPACE Brake/Jump");

    // Loop
    let lastTime = performance.now();
    let frameCount = 0;
    let lastFpsTime = 0;

    const animate = (time: number) => {
        const eng = engineRef.current;
        if (!eng) return;
        
        const dt = Math.min((time - lastTime) / 1000, 0.05);
        lastTime = time;

        // FPS
        frameCount++;
        if (time - lastFpsTime >= 1000) {
            setDebug(prev => ({...prev, fps: frameCount}));
            frameCount = 0;
            lastFpsTime = time;
        }

        const inputs = eng.inputMgr.state;
        
        // Mode Switch Interaction
        if (inputs.action) {
            inputs.action = false;
            if (eng.currentCar) {
                // Exit
                const exitPos = eng.currentCar.mesh.position.clone().add(new THREE.Vector3(2.5, 2, 0));
                eng.player.body.position.copy(exitPos);
                eng.player.body.velocity.set(0,0,0);
                eng.player.mesh.visible = true;
                eng.player.isDriving = false;
                
                eng.currentCar.engineOn = false;
                eng.currentCar = null;
                eng.cameraRig.mode = CameraMode.THIRD_PERSON;
                setDebug(p => ({...p, mode: 'WALK'}));
                setMsg("On Foot");
            } else {
                // Enter
                let nearest = null;
                let minDist = 5;
                eng.cars.forEach((c: Car) => {
                    const d = c.mesh.position.distanceTo(eng.player.mesh.position);
                    if (d < minDist) { minDist = d; nearest = c; }
                });
                if (nearest) {
                    eng.currentCar = nearest;
                    eng.currentCar.engineOn = true;
                    eng.player.isDriving = true;
                    eng.cameraRig.mode = CameraMode.THIRD_PERSON;
                    setDebug(p => ({...p, mode: 'DRIVE'}));
                    setMsg("Driving " + nearest.config.name);
                }
            }
        }

        // Camera Toggle
        if (inputs.camToggle) {
            inputs.camToggle = false;
            eng.cameraRig.mode = eng.cameraRig.mode === CameraMode.THIRD_PERSON ? CameraMode.FIRST_PERSON : CameraMode.THIRD_PERSON;
        }

        // Update
        eng.physics.step(dt);
        eng.world.update(dt, eng.currentCar ? eng.currentCar.mesh.position : eng.player.mesh.position);
        
        eng.player.update(dt, inputs, eng.physics);
        eng.cars.forEach((c: Car) => c.update(dt, inputs, eng.physics));
        
        // Update Pedestrians
        eng.world.pedestrians.forEach((p: Pedestrian) => p.update(dt, inputs, eng.physics));

        // Camera
        const target = eng.currentCar ? eng.currentCar.mesh : eng.player.mesh;
        eng.cameraRig.update(dt, target.position, target.quaternion, inputs, eng.physics, !!eng.currentCar);

        // Render
        eng.renderer.render(eng.scene, eng.camera);
        
        // UI Update
        if (eng.currentCar) {
            setDebug(p => ({...p, speed: Math.floor(eng.currentCar.speed * 3.6)}));
        }

        requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    const handleResize = () => {
        const eng = engineRef.current;
        if (!eng) return;
        eng.camera.aspect = window.innerWidth / window.innerHeight;
        eng.camera.updateProjectionMatrix();
        eng.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        if (mountRef.current) mountRef.current.innerHTML = '';
        window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="relative w-full h-screen font-sans select-none cursor-none text-white overflow-hidden">
        <div ref={mountRef} className="absolute inset-0 bg-black" />
        
        {/* Modern HUD */}
        <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-4xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-600 drop-shadow-[0_2px_10px_rgba(0,255,255,0.5)]">
                        NEON HORIZON
                    </h1>
                    <div className="flex gap-4 mt-2 text-sm font-mono text-cyan-200/80">
                        <span>FPS: {debug.fps}</span>
                        <span>MODE: {debug.mode}</span>
                    </div>
                </div>
                {/* Mini-map ring */}
                <div className="w-36 h-36 rounded-full border-4 border-white/10 bg-black/80 backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.2)] relative">
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-cyan-500/50 animate-pulse">GPS ACTIVE</div>
                    <div className="absolute top-1/2 left-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[12px] border-b-cyan-400 -translate-x-1/2 -translate-y-1/2" />
                </div>
            </div>

            {/* Notification */}
            <div className="self-center transform transition-all duration-300">
                 <div className="bg-black/70 px-12 py-3 backdrop-blur-md text-cyan-50 font-bold tracking-widest border border-cyan-500/30 rounded-full shadow-[0_0_15px_rgba(0,255,255,0.1)]">
                    {msg}
                 </div>
            </div>

            {/* Dashboard */}
            <div className="flex justify-end items-end">
                {debug.mode === 'DRIVE' && (
                    <div className="flex flex-col items-end">
                        <div className="relative flex items-baseline gap-2">
                            <span className="text-9xl font-black tabular-nums tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 drop-shadow-lg">
                                {debug.speed}
                            </span>
                            <span className="text-2xl font-bold text-cyan-500 italic">KM/H</span>
                        </div>
                        <div className="w-96 h-6 bg-gray-900/80 skew-x-[-15deg] rounded-sm overflow-hidden border border-white/20 relative">
                            <div className="absolute inset-0 flex justify-between px-2">
                                {[...Array(10)].map((_,i) => <div key={i} className="w-0.5 h-full bg-black/50"/>)}
                            </div>
                            <div 
                                className="h-full bg-gradient-to-r from-cyan-600 via-blue-500 to-red-500 transition-all duration-75 ease-linear shadow-[0_0_15px_rgba(0,255,255,0.5)]"
                                style={{ width: `${Math.min(debug.speed / 2.5, 100)}%` }}
                            />
                        </div>
                    </div>
                )}
                
                {debug.mode === 'WALK' && (
                    <div className="flex gap-6 text-sm font-mono text-gray-400 bg-black/50 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                        <div className="text-right">
                            <div className="text-xs text-cyan-500 mb-1 tracking-wider">WEAPON</div>
                            <div className="text-xl font-bold text-white">PISTOL <span className="text-gray-500">AUTO</span></div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-red-500 mb-1 tracking-wider">HEALTH</div>
                            <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden"><div className="w-full h-full bg-red-500 shadow-[0_0_8px_red]"/></div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Reticle - Dynamic */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none mix-blend-difference flex items-center justify-center">
             <div className="w-1 h-1 bg-red-500 rounded-full shadow-[0_0_4px_red]"/>
             <div className="absolute w-6 h-6 border border-white/30 rounded-full opacity-50"/>
        </div>
    </div>
  );
}