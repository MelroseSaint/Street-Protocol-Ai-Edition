import * as THREE from 'three';

export enum ControlMode {
  WALKING = 'WALKING',
  DRIVING = 'DRIVING'
}

export enum CameraMode {
  THIRD_PERSON = 'THIRD_PERSON',
  FIRST_PERSON = 'FIRST_PERSON',
  TRANSITION = 'TRANSITION'
}

export enum Faction {
  CIVILIAN = 'CIVILIAN',
  POLICE = 'POLICE',
  GANG = 'GANG'
}

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  brake: boolean;
  jump: boolean;
  action: boolean;
  run: boolean;
  camToggle: boolean;
  shoot: boolean; // New Input
  // Mouse
  mouseX: number;
  mouseY: number;
  viewX: number;
  viewY: number;
}

export interface VehicleConfig {
  name: string;
  mass: number;
  enginePower: number;
  brakeForce: number;
  maxRPM: number;
  drag: number;
  suspensionLength: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  frictionLat: number;
  frictionLong: number;
  turnSpeed: number;
  wheelRadius: number;
  width: number;
  length: number;
  height: number;
  color: number;
  type: 'sedan' | 'truck' | 'sport';
}

export interface PhysicsBody {
  mass: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
  size: THREE.Vector3;
  collider: {
    type: 'box' | 'capsule';
    size: THREE.Vector3;
  };
  isGrounded: boolean;
  isSleeping: boolean;
}

export interface GameEntity {
  id: string;
  mesh: THREE.Group;
  body: PhysicsBody;
  update: (dt: number, inputs: InputState, world: any) => void;
  cleanup?: () => void;
}