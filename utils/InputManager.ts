import { InputState } from '../types';

export class InputManager {
  state: InputState = {
    forward: false, backward: false, left: false, right: false,
    brake: false, jump: false, action: false, run: false, camToggle: false, shoot: false,
    mouseX: 0, mouseY: 0, viewX: 0, viewY: 0
  };

  private domElement: HTMLElement;
  private isLocked = false;

  constructor(domElement: HTMLElement) {
    this.domElement = domElement;
    this.init();
  }

  init() {
    document.addEventListener('keydown', this.onKeyDown.bind(this));
    document.addEventListener('keyup', this.onKeyUp.bind(this));
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mousedown', this.onMouseDown.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
    document.addEventListener('pointerlockchange', this.onLockChange.bind(this));
    
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked) this.domElement.requestPointerLock();
    });
  }

  private onLockChange() {
    this.isLocked = document.pointerLockElement === this.domElement;
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isLocked) return;
    
    const sensitivity = 0.002;
    this.state.mouseX = e.movementX * sensitivity;
    this.state.mouseY = e.movementY * sensitivity;

    this.state.viewX -= this.state.mouseX;
    this.state.viewY += this.state.mouseY;
    
    const limit = Math.PI / 2 - 0.1;
    this.state.viewY = Math.max(-limit, Math.min(limit, this.state.viewY));
  }

  private onMouseDown(e: MouseEvent) {
      if (this.isLocked && e.button === 0) {
          this.state.shoot = true;
      }
  }

  private onMouseUp(e: MouseEvent) {
      if (e.button === 0) {
          this.state.shoot = false;
      }
  }

  private onKeyDown(e: KeyboardEvent) {
    this.mapKeys(e.code, true);
  }

  private onKeyUp(e: KeyboardEvent) {
    this.mapKeys(e.code, false);
  }

  private mapKeys(code: string, value: boolean) {
    switch(code) {
      case 'KeyW': this.state.forward = value; break;
      case 'KeyS': this.state.backward = value; break;
      case 'KeyA': this.state.left = value; break;
      case 'KeyD': this.state.right = value; break;
      case 'Space': 
        this.state.brake = value; 
        this.state.jump = value; 
        break;
      case 'ShiftLeft': this.state.run = value; break;
      case 'KeyE': if(value) this.state.action = true; break;
      case 'KeyV': if(value) this.state.camToggle = true; break;
    }
  }

  resetTriggers() {
    this.state.action = false;
    this.state.camToggle = false;
    this.state.mouseX = 0;
    this.state.mouseY = 0;
  }
}