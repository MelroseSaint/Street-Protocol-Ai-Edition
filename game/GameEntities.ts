import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GameEntity, PhysicsBody, InputState, VehicleConfig, Faction } from '../types';
import { PhysicsWorld } from '../engine/Physics';
import { SoundManager } from '../utils/assets';

// --- Asset Loading Utilities ---
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const MODEL_URLS = {
    soldier: 'https://threejs.org/examples/models/gltf/Soldier.glb',
    ferrari: 'https://threejs.org/examples/models/gltf/ferrari.glb',
    ferrariAO: 'https://threejs.org/examples/models/gltf/ferrari_ao.png'
};

// --- Player Entity ---
export class Player implements GameEntity {
  id = 'player';
  mesh: THREE.Group;
  body: PhysicsBody;
  isDriving = false;
  
  // Animation
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private currentActionStr = 'Idle';
  
  // Combat
  private lastShootTime = 0;
  private gunMesh: THREE.Object3D | null = null;

  constructor(startPos: THREE.Vector3) {
    this.mesh = new THREE.Group();
    this.mesh.position.copy(startPos);
    
    this.body = {
      mass: 75,
      position: startPos.clone(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      angularVelocity: new THREE.Vector3(),
      size: new THREE.Vector3(0.5, 1.8, 0.5),
      collider: { type: 'capsule', size: new THREE.Vector3(0.35, 1.7, 0) },
      isGrounded: false,
      isSleeping: false
    };

    this.loadModel();
  }

  private loadModel() {
      gltfLoader.load(MODEL_URLS.soldier, (gltf) => {
          const model = gltf.scene;
          model.traverse((o: any) => {
              if (o.isMesh) {
                  o.castShadow = true;
                  o.receiveShadow = true;
                  // Tint Player White/Grey (Hoodie feel)
                  const mat = (o.material as THREE.MeshStandardMaterial).clone();
                  mat.color.setHex(0xaaaaaa);
                  o.material = mat;
              }
          });
          model.scale.set(1, 1, 1); 
          model.position.y = -0.9; 
          model.rotation.y = Math.PI;

          this.mesh.add(model);

          this.mixer = new THREE.AnimationMixer(model);
          const clips = gltf.animations;
          this.actions['Idle'] = this.mixer.clipAction(clips[0]);
          this.actions['Run'] = this.mixer.clipAction(clips[1]);
          this.actions['Walk'] = this.mixer.clipAction(clips[3]);
          this.actions['Idle'].play();

          // Gun
          const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), new THREE.MeshStandardMaterial({color: 0x111111}));
          // Attach to hand bone if possible, for now just offset
          const rightHand = model.getObjectByName('mixamorigRightHand');
          if (rightHand) {
              rightHand.add(gun);
              gun.position.set(0, 0.1, 0.1);
              gun.rotation.x = -Math.PI/2;
              this.gunMesh = gun;
          }
      });
  }

  update(dt: number, inputs: InputState, world: PhysicsWorld) {
    if (this.isDriving) {
        this.mesh.visible = false;
        this.body.position.copy(this.mesh.position);
        return;
    }
    this.mesh.visible = true;

    // --- Movement ---
    const yaw = inputs.viewX;
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
    
    const wishDir = new THREE.Vector3();
    if (inputs.forward) wishDir.add(forward);
    if (inputs.backward) wishDir.sub(forward);
    if (inputs.right) wishDir.add(right);
    if (inputs.left) wishDir.sub(right);
    if (wishDir.lengthSq() > 0) wishDir.normalize();
    
    const targetSpeed = inputs.run ? 8.0 : 3.5;
    let acceleration = 40.0;
    let friction = 8.0;
    
    if (!this.body.isGrounded) {
        acceleration = 5.0; 
        friction = 0.5;
    }
    
    if (wishDir.lengthSq() > 0) {
        const currentSpeed = this.body.velocity.dot(wishDir);
        const deficit = targetSpeed - currentSpeed;
        if (deficit > 0) this.body.velocity.addScaledVector(wishDir, Math.min(deficit * 2.0, acceleration * dt));
        
        const angle = Math.atan2(wishDir.x, wishDir.z);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), angle + Math.PI); 
        this.mesh.quaternion.slerp(q, 10.0 * dt);
    }
    
    // Friction
    const planarVel = new THREE.Vector3(this.body.velocity.x, 0, this.body.velocity.z);
    const speed = planarVel.length();
    if (speed > 0) {
        const drop = speed * friction * dt;
        const newSpeed = Math.max(0, speed - drop);
        planarVel.multiplyScalar(newSpeed / speed);
        this.body.velocity.x = planarVel.x;
        this.body.velocity.z = planarVel.z;
    }
    
    if (inputs.jump && this.body.isGrounded) {
        this.body.velocity.y = 8;
        this.body.isGrounded = false;
    }

    // --- Combat ---
    if (inputs.shoot && performance.now() - this.lastShootTime > 200) {
        this.shoot(world, forward);
        this.lastShootTime = performance.now();
    }

    // --- Animation ---
    if (this.mixer) {
        let nextAction = 'Idle';
        const groundSpeed = new THREE.Vector2(this.body.velocity.x, this.body.velocity.z).length();
        if (groundSpeed > 0.5) nextAction = (groundSpeed > 4.0) ? 'Run' : 'Walk';
        
        if (nextAction === 'Walk') this.actions['Walk'].timeScale = Math.max(0.8, groundSpeed / 3.5);
        if (nextAction === 'Run') this.actions['Run'].timeScale = Math.max(0.8, groundSpeed / 8.0);

        if (nextAction !== this.currentActionStr) {
            this.actions[this.currentActionStr]?.fadeOut(0.25);
            this.actions[nextAction]?.reset().fadeIn(0.25).play();
            this.currentActionStr = nextAction;
        }
        this.mixer.update(dt);
    }
    
    this.mesh.position.copy(this.body.position);
  }

  private shoot(world: PhysicsWorld, dir: THREE.Vector3) {
      // Raycast from camera pos roughly
      const origin = this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      
      // Visual Tracer
      const tracer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2), new THREE.MeshBasicMaterial({color: 0xffff00}));
      tracer.position.copy(origin);
      tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), dir);
      this.mesh.parent?.add(tracer);
      
      const speed = 100;
      const life = 0.5;
      let t = 0;
      
      const animTracer = () => {
          t += 0.016;
          tracer.position.addScaledVector(dir, speed * 0.016);
          if (t > life) {
              tracer.removeFromParent();
          } else {
              requestAnimationFrame(animTracer);
          }
      };
      animTracer();

      // Muzzle Flash
      if (this.gunMesh) {
          const light = new THREE.PointLight(0xffaa00, 5, 5);
          light.position.copy(this.gunMesh.getWorldPosition(new THREE.Vector3()));
          this.mesh.parent?.add(light);
          setTimeout(() => light.removeFromParent(), 50);
      }
  }
}

// --- AI Pedestrian ---
export class Pedestrian implements GameEntity {
  id: string;
  mesh: THREE.Group;
  body: PhysicsBody;
  faction: Faction;
  
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  
  // AI State
  private targetPos = new THREE.Vector3();
  private waitTime = 0;
  private walkSpeed = 2.5;

  constructor(id: string, startPos: THREE.Vector3, faction: Faction) {
    this.id = id;
    this.faction = faction;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(startPos);
    
    this.body = {
      mass: 70,
      position: startPos.clone(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      angularVelocity: new THREE.Vector3(),
      size: new THREE.Vector3(0.5, 1.8, 0.5),
      collider: { type: 'capsule', size: new THREE.Vector3(0.35, 1.7, 0) },
      isGrounded: false,
      isSleeping: false
    };

    this.pickTarget();
    this.loadModel();
  }

  private loadModel() {
      gltfLoader.load(MODEL_URLS.soldier, (gltf) => {
          const model = gltf.scene;
          // Apply Faction Visuals
          model.traverse((o: any) => {
              if (o.isMesh) {
                  o.castShadow = true;
                  o.receiveShadow = true;
                  const mat = (o.material as THREE.MeshStandardMaterial).clone();
                  
                  if (this.faction === Faction.POLICE) {
                      // Blue Uniform
                      mat.color.setHex(0x002288);
                  } else if (this.faction === Faction.GANG) {
                      // Red/Black (Misfits/Hoodie style)
                      mat.color.setHex(Math.random() > 0.5 ? 0x880000 : 0x111111);
                  } else {
                      // Punk/Civilian (Orange/Green/Skin)
                      mat.color.setHex(Math.random() > 0.5 ? 0xff8800 : 0x44aa44);
                  }
                  o.material = mat;
              }
          });
          model.scale.set(1, 1, 1); 
          model.position.y = -0.9; 
          model.rotation.y = Math.PI;

          this.mesh.add(model);
          
          if (this.faction === Faction.POLICE) {
              // Police Hat (simple box)
              const hat = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.3), new THREE.MeshStandardMaterial({color: 0x000044}));
              const head = model.getObjectByName('mixamorigHead');
              if (head) {
                  head.add(hat);
                  hat.position.y = 0.2;
                  hat.position.z = 0.05;
              }
          }

          this.mixer = new THREE.AnimationMixer(model);
          const clips = gltf.animations;
          this.actions['Idle'] = this.mixer.clipAction(clips[0]);
          this.actions['Run'] = this.mixer.clipAction(clips[1]);
          this.actions['Walk'] = this.mixer.clipAction(clips[3]);
          this.actions['Walk'].play();
      });
  }

  private pickTarget() {
      // Pick random point on X/Z within 20m, but keep Y aligned
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 20;
      this.targetPos.set(
          this.body.position.x + Math.cos(angle) * dist,
          this.body.position.y,
          this.body.position.z + Math.sin(angle) * dist
      );
  }

  update(dt: number, inputs: InputState, world: PhysicsWorld) {
    if (this.waitTime > 0) {
        this.waitTime -= dt;
        this.body.velocity.x *= 0.9;
        this.body.velocity.z *= 0.9;
        return;
    }

    const toTarget = this.targetPos.clone().sub(this.body.position);
    toTarget.y = 0;
    const dist = toTarget.length();
    
    if (dist < 1.0) {
        this.waitTime = 2 + Math.random() * 3;
        this.pickTarget();
        if (this.mixer) {
            this.actions['Walk'].fadeOut(0.2);
            this.actions['Idle'].reset().fadeIn(0.2).play();
        }
    } else {
        toTarget.normalize();
        
        // Police Chase logic placeholder
        // if (this.faction === Faction.POLICE && world.player.wanted) ...

        this.body.velocity.x += (toTarget.x * this.walkSpeed - this.body.velocity.x) * 5 * dt;
        this.body.velocity.z += (toTarget.z * this.walkSpeed - this.body.velocity.z) * 5 * dt;
        
        // Rotate
        const angle = Math.atan2(toTarget.x, toTarget.z);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), angle + Math.PI);
        this.mesh.quaternion.slerp(q, 5 * dt);
        
        if (this.mixer && this.actions['Walk'] && !this.actions['Walk'].isRunning()) {
             this.actions['Idle'].fadeOut(0.2);
             this.actions['Walk'].reset().fadeIn(0.2).play();
        }
    }

    if (this.mixer) this.mixer.update(dt);
    this.mesh.position.copy(this.body.position);
  }
}

// --- High Fidelity Physics Car (Unchanged Logic, just re-export) ---
export class Car implements GameEntity {
  id: string;
  mesh: THREE.Group;
  body: PhysicsBody;
  config: VehicleConfig;
  private wheels: THREE.Object3D[] = [];
  engineOn = false;
  steeringAngle = 0;
  speed = 0;
  private soundMgr: SoundManager;

  constructor(id: string, startPos: THREE.Vector3, config: VehicleConfig, soundMgr: SoundManager) {
    this.id = id;
    this.config = config;
    this.soundMgr = soundMgr;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(startPos);
    this.body = {
      mass: config.mass,
      position: startPos.clone(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      angularVelocity: new THREE.Vector3(),
      size: new THREE.Vector3(config.length, config.height, config.width),
      collider: { type: 'box', size: new THREE.Vector3(config.length/2, config.height/2, config.width/2) },
      isGrounded: true,
      isSleeping: false
    };
    this.loadModel();
  }

  private loadModel() {
      gltfLoader.load(MODEL_URLS.ferrari, (gltf) => {
          const carModel = gltf.scene.children[0];
          carModel.rotation.y = Math.PI;
          const bodyColor = new THREE.Color(this.config.color);
          const bodyMat = new THREE.MeshPhysicalMaterial({ color: bodyColor, metalness: 0.6, roughness: 0.2, clearcoat: 1.0 });
          const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.9, roughness: 0, transmission: 0.2, transparent: true });
          carModel.traverse((o: any) => {
              if (o.isMesh) {
                  o.castShadow = true;
                  o.receiveShadow = true;
                  if (o.name === 'body') o.material = bodyMat;
                  if (o.name === 'glass') o.material = glassMat;
              }
          });
          this.wheels = [
              carModel.getObjectByName('wheel_fl')!,
              carModel.getObjectByName('wheel_fr')!,
              carModel.getObjectByName('wheel_rl')!,
              carModel.getObjectByName('wheel_rr')!
          ];
          const textureLoader = new THREE.TextureLoader();
          textureLoader.load(MODEL_URLS.ferrariAO, (tex) => {
             const shadowPlane = new THREE.Mesh(
                 new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4),
                 new THREE.MeshBasicMaterial({ map: tex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true })
             );
             shadowPlane.rotation.x = -Math.PI/2;
             shadowPlane.position.y = 0.05;
             shadowPlane.renderOrder = 2;
             carModel.add(shadowPlane);
          });
          this.mesh.add(carModel);
          // Headlights
          const hlLeft = new THREE.SpotLight(0xffffff, 50, 40, 0.5, 0.5);
          hlLeft.position.set(-0.6, 0.6, -2.0);
          hlLeft.target.position.set(-0.6, 0.2, -10);
          carModel.add(hlLeft); carModel.add(hlLeft.target);
          const hlRight = new THREE.SpotLight(0xffffff, 50, 40, 0.5, 0.5);
          hlRight.position.set(0.6, 0.6, -2.0);
          hlRight.target.position.set(0.6, 0.2, -10);
          carModel.add(hlRight); carModel.add(hlRight.target);
      });
  }

  update(dt: number, inputs: InputState, world: PhysicsWorld) {
    const wX = 0.85; const wY = 0.2; const wZ = 1.35;
    const mountPoints = [
        new THREE.Vector3(-wX, wY, -wZ), new THREE.Vector3(wX, wY, -wZ),
        new THREE.Vector3(-wX, wY, wZ), new THREE.Vector3(wX, wY, wZ),
    ];
    const impulses: {pos: THREE.Vector3, force: THREE.Vector3}[] = [];
    this.speed = this.body.velocity.length();
    const forwardSpeed = this.body.velocity.dot(new THREE.Vector3(0,0,-1).applyQuaternion(this.body.rotation));
    let throttle = 0; let steerInput = 0; let brake = 0;
    if (this.engineOn) {
        if (inputs.forward) throttle = 1;
        if (inputs.backward) throttle = -0.5;
        if (inputs.left) steerInput = 1;
        if (inputs.right) steerInput = -1;
        if (inputs.brake) brake = 1;
        this.soundMgr.updateEngineRPM(Math.abs(forwardSpeed) * 5);
    }
    const maxSteer = Math.PI / 4; 
    const steerFactor = 1.0 / (1.0 + (this.speed / 20.0));
    const targetSteer = steerInput * maxSteer * steerFactor;
    this.steeringAngle += (targetSteer - this.steeringAngle) * 5.0 * dt;

    mountPoints.forEach((mountLocal, i) => {
        const isFront = i < 2;
        const mountWorld = mountLocal.clone().applyQuaternion(this.body.rotation).add(this.body.position);
        const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.body.rotation);
        const hit = world.raycast(mountWorld, down, this.config.suspensionLength + this.config.wheelRadius);
        let suspensionForce = 0;
        if (hit) {
            const dist = hit.dist; const travel = dist - this.config.wheelRadius;
            let compression = 1.0 - (travel / this.config.suspensionLength);
            compression = Math.max(0, Math.min(1, compression));
            const springF = compression * this.config.suspensionStiffness;
            const r = mountWorld.clone().sub(this.body.position);
            const pointVel = this.body.velocity.clone().add(this.body.angularVelocity.clone().cross(r));
            const velUp = pointVel.dot(down);
            const dampF = -velUp * this.config.suspensionDamping;
            suspensionForce = Math.max(0, springF + dampF);
            const suspensionImpulse = down.clone().multiplyScalar(-suspensionForce);
            impulses.push({ pos: mountWorld, force: suspensionImpulse });
            const wheelRot = this.body.rotation.clone();
            if (isFront) wheelRot.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), this.steeringAngle));
            const wheelForward = new THREE.Vector3(0, 0, -1).applyQuaternion(wheelRot);
            const wheelRight = new THREE.Vector3(1, 0, 0).applyQuaternion(wheelRot);
            const vForward = pointVel.dot(wheelForward); const vRight = pointVel.dot(wheelRight);
            let latGrip = this.config.frictionLat;
            if (Math.abs(vRight) > 5.0 && inputs.brake) latGrip *= 0.5; 
            const latForceMag = -vRight * latGrip * (suspensionForce / 2000); 
            const latForce = wheelRight.clone().multiplyScalar(latForceMag);
            impulses.push({ pos: mountWorld, force: latForce });
            let longForceMag = 0;
            if (this.engineOn) {
                if (Math.abs(throttle) > 0.01) {
                    if (!isFront || this.config.type === 'truck') {
                         const torqueFactor = 1.0 - Math.min(Math.abs(vForward) / 60.0, 0.8);
                         longForceMag = throttle * this.config.enginePower * torqueFactor;
                    }
                }
                if (brake > 0) {
                    longForceMag -= Math.sign(vForward) * this.config.brakeForce * brake * 20;
                    if (Math.abs(vForward) < 1.0 && brake > 0) this.body.velocity.multiplyScalar(0.9);
                }
            } else { longForceMag = -vForward * 50; }
            const longForce = wheelForward.clone().multiplyScalar(longForceMag);
            impulses.push({ pos: mountWorld, force: longForce });
            if (this.wheels[i]) {
                const w = this.wheels[i];
                w.position.y = mountLocal.y - travel;
                if (isFront) w.rotation.y = this.steeringAngle;
                w.rotation.x += vForward * dt / this.config.wheelRadius;
            }
        } else {
            if (this.wheels[i]) {
                const w = this.wheels[i];
                w.position.y = mountLocal.y - this.config.suspensionLength;
            }
        }
    });
    impulses.forEach(imp => {
        this.body.velocity.addScaledVector(imp.force, dt / this.body.mass);
        const r = imp.pos.clone().sub(this.body.position);
        this.body.angularVelocity.addScaledVector(r.cross(imp.force), dt / (this.body.mass * 2.0)); 
    });
    this.body.velocity.addScaledVector(this.body.velocity, -this.config.drag * this.speed * dt);
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.rotation);
  }
}