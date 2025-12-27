import * as THREE from 'three';
import { CameraMode, InputState } from '../types';
import { PhysicsWorld } from '../engine/Physics';

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  mode: CameraMode = CameraMode.THIRD_PERSON;
  
  // State
  private currentPos = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  
  // Settings
  private thirdPersonDist = 6.0;
  private thirdPersonHeight = 2.0;
  private smoothing = 0.1;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentPos.copy(camera.position);
  }

  update(dt: number, targetPos: THREE.Vector3, targetRot: THREE.Quaternion, inputs: InputState, world: PhysicsWorld, isVehicle: boolean) {
    // 1. Determine Desired Position & LookAt based on Mode
    const desiredPos = new THREE.Vector3();
    const desiredLookAt = targetPos.clone();
    
    if (this.mode === CameraMode.FIRST_PERSON) {
        // Cockpit / Head View
        const offset = isVehicle ? new THREE.Vector3(-0.3, 0.7, 0) : new THREE.Vector3(0, 1.7, 0); 
        
        const headPos = offset.clone().applyQuaternion(targetRot).add(targetPos);
        desiredPos.copy(headPos);
        
        // Apply Mouse Look
        const camQ = targetRot.clone();
        // Yaw (Y-axis)
        camQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), inputs.viewX));
        // Pitch (X-axis, inverted input for look-up)
        camQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -inputs.viewY)); 
        
        // Offset look point forward relative to camera rotation
        const lookPoint = headPos.clone().add(new THREE.Vector3(0, 0, -10).applyQuaternion(camQ)); 
        desiredLookAt.copy(lookPoint);

        // First person is stiff
        this.currentPos.lerp(desiredPos, 0.5); 
        this.currentLookAt.lerp(desiredLookAt, 0.5);
        
        this.camera.position.copy(this.currentPos);
        this.camera.quaternion.copy(camQ); 
        return; 
    } 
    else {
        // Third Person Orbit
        const yaw = inputs.viewX;
        // Pitch input controls height
        const pitch = Math.max(-0.5, Math.min(1.0, inputs.viewY));
        
        // Orbit Math aligned to -Z forward
        // Yaw 0 -> Camera at +Z (Behind)
        const dist = this.thirdPersonDist;
        const hOffset = Math.sin(pitch) * dist;
        const rOffset = Math.cos(pitch) * dist;
        
        const offsetX = Math.sin(yaw) * rOffset;
        const offsetZ = Math.cos(yaw) * rOffset;
        
        const camOffset = new THREE.Vector3(offsetX, hOffset + this.thirdPersonHeight, offsetZ);
        desiredPos.copy(targetPos).add(camOffset);
        
        // Collision Probe (Camera Whisker)
        const direction = desiredPos.clone().sub(targetPos).normalize();
        const fullDist = targetPos.distanceTo(desiredPos);
        
        let hitDist = fullDist;
        const rayStart = targetPos.clone().add(new THREE.Vector3(0, 1.0, 0)); 
        
        const ray = new THREE.Ray(rayStart, direction);
        const boxVec = new THREE.Vector3();
        
        for (const box of world.staticColliders) {
            const intersect = ray.intersectBox(box, boxVec);
            if (intersect) {
                const d = rayStart.distanceTo(intersect);
                if (d < hitDist) hitDist = d;
            }
        }
        
        if (hitDist < fullDist) {
            desiredPos.copy(rayStart).add(direction.multiplyScalar(hitDist - 0.2));
        }

        // Apply
        this.currentPos.lerp(desiredPos, 1.0 - Math.pow(0.001, dt));
        this.currentLookAt.lerp(targetPos.clone().add(new THREE.Vector3(0, 1.0, 0)), 1.0 - Math.pow(0.001, dt));
        
        this.camera.position.copy(this.currentPos);
        this.camera.lookAt(this.currentLookAt);
    }
  }
}