import * as THREE from 'three';
import { PhysicsBody } from '../types';

const GRAVITY = new THREE.Vector3(0, -25, 0); // Snappy gravity
const MAX_STEP_HEIGHT = 0.4; // Max height to climb without jumping

export class PhysicsWorld {
  bodies: PhysicsBody[] = [];
  staticColliders: THREE.Box3[] = [];

  addBody(body: PhysicsBody) {
    this.bodies.push(body);
  }

  addStaticCollider(box: THREE.Box3) {
    this.staticColliders.push(box);
  }

  step(dt: number) {
    // Sub-stepping for stability
    const steps = 4;
    const subDt = dt / steps;
    
    for (let i = 0; i < steps; i++) {
        this.simulate(subDt);
    }
  }

  private simulate(dt: number) {
    for (const body of this.bodies) {
        if (body.mass === 0) continue; 

        // Safety Bounds (Anti-Void)
        if (body.position.y < -20) {
            body.position.set(0, 10, 0);
            body.velocity.set(0, 0, 0);
            continue;
        }

        // Apply Forces
        body.velocity.addScaledVector(GRAVITY, dt);
        
        // Ground Friction / Air Drag handled in Entity Update mostly, but we add base damping here
        const damping = body.isGrounded ? 0.05 : 0.01;
        body.velocity.multiplyScalar(1.0 - (damping)); 
        body.angularVelocity.multiplyScalar(1.0 - (2.0 * dt)); 
        
        // Integration
        body.position.addScaledVector(body.velocity, dt);

        // Rotation
        const angle = body.angularVelocity.length() * dt;
        if (angle > 0.0001) {
            const axis = body.angularVelocity.clone().normalize();
            const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
            body.rotation.multiply(q);
            body.rotation.normalize();
        }

        // Collision Resolution
        body.isGrounded = false;
        
        if (body.collider.type === 'capsule') {
            this.resolveCapsule(body);
        } else {
            this.resolveBox(body);
        }
    }
  }

  private resolveCapsule(body: PhysicsBody) {
    const radius = body.collider.size.x;
    const height = body.collider.size.y;
    const halfHeight = height / 2;
    
    // 1. Floor Plane Interaction
    if (body.position.y < halfHeight) {
        body.position.y = halfHeight;
        if (body.velocity.y < 0) body.velocity.y = 0;
        body.isGrounded = true;
    }
    
    // 2. Static World Interaction
    const pos = body.position;
    const playerBottom = pos.y - halfHeight;
    
    // Capsule bounds
    const capsuleBox = new THREE.Box3().setFromCenterAndSize(
        pos, 
        new THREE.Vector3(radius * 2, height, radius * 2)
    );

    for (const staticBox of this.staticColliders) {
        if (capsuleBox.intersectsBox(staticBox)) {
            const stepDiff = staticBox.max.y - playerBottom;
            
            // Step Climbing Logic:
            if (stepDiff > 0 && stepDiff <= MAX_STEP_HEIGHT && staticBox.max.y < (pos.y + halfHeight - 0.1)) {
                 body.position.y = Math.max(body.position.y, staticBox.max.y + halfHeight);
                 body.velocity.y = 0; 
                 body.isGrounded = true;
            } else {
                // Wall Collision - Hard Push
                const center = new THREE.Vector3();
                staticBox.getCenter(center);
                
                // Find nearest point on box to circle
                const clampedX = Math.max(staticBox.min.x, Math.min(pos.x, staticBox.max.x));
                const clampedZ = Math.max(staticBox.min.z, Math.min(pos.z, staticBox.max.z));
                
                const diff = new THREE.Vector3(pos.x - clampedX, 0, pos.z - clampedZ);
                const dist = diff.length();
                
                if (dist < radius && dist > 0) {
                     const overlap = radius - dist;
                     diff.normalize();
                     body.position.addScaledVector(diff, overlap);
                     
                     // Kill velocity into wall
                     const vDot = body.velocity.dot(diff);
                     if (vDot < 0) {
                         body.velocity.addScaledVector(diff, -vDot);
                     }
                } else if (dist === 0) {
                     // Inside box, push out via min axis
                     // Simplified logic for deep penetration
                     const dx = (pos.x > center.x) ? staticBox.max.x - (pos.x - radius) : (pos.x + radius) - staticBox.min.x;
                     const dz = (pos.z > center.z) ? staticBox.max.z - (pos.z - radius) : (pos.z + radius) - staticBox.min.z;
                     if (Math.abs(dx) < Math.abs(dz)) {
                        body.position.x += (pos.x > center.x ? 1 : -1) * Math.abs(dx * 0.5);
                     } else {
                        body.position.z += (pos.z > center.z ? 1 : -1) * Math.abs(dz * 0.5);
                     }
                }
            }
        }
    }
  }

  private resolveBox(body: PhysicsBody) {
      const halfHeight = body.collider.size.y;
      const halfWidth = body.collider.size.z;
      const halfLength = body.collider.size.x;

      // Ground
      if (body.position.y < halfHeight) {
          body.position.y = halfHeight;
          if (body.velocity.y < 0) {
              body.velocity.y *= -0.3; // Bounce
              body.velocity.x *= 0.99; // Ground Friction
              body.velocity.z *= 0.99;
          }
      }
      
      const pBox = new THREE.Box3().setFromCenterAndSize(body.position, body.size);
      
      for (const staticBox of this.staticColliders) {
          if (pBox.intersectsBox(staticBox)) {
               // Hard Resolve
               const intersection = pBox.clone().intersect(staticBox);
               const sz = new THREE.Vector3();
               intersection.getSize(sz);
               
               // Push out along smallest intersection axis
               if (sz.x < sz.z && sz.x < sz.y) {
                    const dir = body.position.x > staticBox.max.x ? 1 : -1;
                    body.position.x += sz.x * dir;
                    body.velocity.x *= -0.5; // Bounce X
               } else if (sz.z < sz.x && sz.z < sz.y) {
                    const dir = body.position.z > staticBox.max.z ? 1 : -1;
                    body.position.z += sz.z * dir;
                    body.velocity.z *= -0.5; // Bounce Z
               } else {
                    // Vertical collision (e.g. landing on crate)
                    const dir = body.position.y > staticBox.max.y ? 1 : -1;
                    body.position.y += sz.y * dir;
                    body.velocity.y = 0;
               }
          }
      }
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxLength: number): { dist: number, point: THREE.Vector3, normal: THREE.Vector3 } | null {
      let closest: { dist: number, point: THREE.Vector3, normal: THREE.Vector3 } | null = null;
      
      // Check Ground
      if (direction.y < 0) {
          const t = -origin.y / direction.y;
          if (t >= 0 && t <= maxLength) {
              closest = {
                  dist: t,
                  point: origin.clone().addScaledVector(direction, t),
                  normal: new THREE.Vector3(0, 1, 0)
              };
          }
      }
      
      // Simple box raycast for static objects could be added here for even better suspension
      
      return closest;
  }
}