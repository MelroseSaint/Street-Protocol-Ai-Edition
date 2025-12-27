import * as THREE from 'three';
import { PhysicsWorld } from '../engine/Physics';
import { Pedestrian } from './GameEntities';
import { Faction } from '../types';

export class WorldManager {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  
  // Streaming
  chunks = new Map<string, THREE.Group>();
  chunkSize = 80; 
  loadDistance = 2; 
  
  playerPos = new THREE.Vector2();
  
  // Entities managed by world
  pedestrians: Pedestrian[] = [];

  // Materials
  private materials: Record<string, THREE.Material>;

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.scene = scene;
    this.physics = physics;
    
    // Environment - Brightened
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemiLight);

    const amb = new THREE.AmbientLight(0x404060, 1.0); 
    scene.add(amb);
    
    const moon = new THREE.DirectionalLight(0xaaccff, 0.8);
    moon.position.set(-100, 200, -100);
    moon.castShadow = true;
    scene.add(moon);
    
    scene.background = new THREE.Color(0x101020); // Brighter Night
    scene.fog = new THREE.FogExp2(0x101020, 0.005);
    
    // Materials
    this.materials = {
        asphalt: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }),
        sidewalk: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8 }),
        grass: new THREE.MeshStandardMaterial({ color: 0x112211, roughness: 1.0 }),
        concrete: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }),
        building: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.5 }),
        glass: new THREE.MeshStandardMaterial({ color: 0x113355, roughness: 0.0, metalness: 0.9 }),
        neonBlue: new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2.0 }),
        neonPink: new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 2.0 }),
        neonOrange: new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 2.0 }),
        lampPost: new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 }),
        water: new THREE.MeshStandardMaterial({ color: 0x001133, roughness: 0.1, metalness: 0.8 })
    };

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshBasicMaterial({ color: 0x080808 })
    );
    ground.rotation.x = -Math.PI/2;
    ground.position.y = -0.2;
    scene.add(ground);
  }

  update(dt: number, playerPos: THREE.Vector3) {
      const cx = Math.floor(playerPos.x / this.chunkSize);
      const cz = Math.floor(playerPos.z / this.chunkSize);
      
      if (cx !== this.playerPos.x || cz !== this.playerPos.y) {
          this.playerPos.set(cx, cz);
          this.refreshChunks(cx, cz);
      }
  }

  refreshChunks(cx: number, cz: number) {
      const needed = new Set<string>();
      for (let x = -this.loadDistance; x <= this.loadDistance; x++) {
          for (let z = -this.loadDistance; z <= this.loadDistance; z++) {
              needed.add(`${cx+x},${cz+z}`);
          }
      }
      
      for (const [key, group] of this.chunks) {
          if (!needed.has(key)) {
              this.scene.remove(group);
              this.chunks.delete(key);
              // Clean up Peds in this chunk (simple logic: just clear all far ones in App, or we ignore for now)
          }
      }
      
      needed.forEach(key => {
          if (!this.chunks.has(key)) {
              const [kx, kz] = key.split(',').map(Number);
              this.generateChunk(kx, kz);
          }
      });
  }

  generateChunk(cx: number, cz: number) {
      const group = new THREE.Group();
      const xOff = cx * this.chunkSize;
      const zOff = cz * this.chunkSize;
      
      const isCanal = Math.abs(cz) % 3 === 2;
      let biome = 'city';
      if (cx < -1) biome = 'industrial';
      else if (cx > 1) biome = 'suburbs';
      
      const groundGeo = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize);
      const ground = new THREE.Mesh(groundGeo, biome === 'suburbs' ? this.materials.grass : this.materials.concrete);
      ground.rotation.x = -Math.PI/2;
      ground.position.set(xOff + this.chunkSize/2, 0, zOff + this.chunkSize/2);
      ground.receiveShadow = true;
      group.add(ground);
      
      if (isCanal && biome !== 'suburbs') {
          // Water channel
          const water = new THREE.Mesh(new THREE.PlaneGeometry(this.chunkSize, 20), this.materials.water);
          water.rotation.x = -Math.PI/2;
          water.position.set(xOff + this.chunkSize/2, -0.5, zOff + this.chunkSize/2);
          group.add(water);
          
          const bankL = new THREE.Mesh(new THREE.BoxGeometry(this.chunkSize, 2, 2), this.materials.concrete);
          bankL.position.set(xOff + this.chunkSize/2, 0.5, zOff + this.chunkSize/2 - 11);
          group.add(bankL);
          this.physics.addStaticCollider(new THREE.Box3().setFromObject(bankL));

          const bankR = new THREE.Mesh(new THREE.BoxGeometry(this.chunkSize, 2, 2), this.materials.concrete);
          bankR.position.set(xOff + this.chunkSize/2, 0.5, zOff + this.chunkSize/2 + 11);
          group.add(bankR);
          this.physics.addStaticCollider(new THREE.Box3().setFromObject(bankR));

          if (cx % 2 === 0) {
              const bridge = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 24), this.materials.asphalt);
              bridge.position.set(xOff + this.chunkSize/2, 1.5, zOff + this.chunkSize/2);
              group.add(bridge);
              this.physics.addStaticCollider(new THREE.Box3().setFromObject(bridge));
          }
      } else {
          this.buildRoads(group, xOff, zOff, biome);
          
          if (biome === 'city') {
              this.buildCityBlock(group, xOff, zOff, cx, cz);
              // Spawn some pedestrians
              for(let i=0; i<3; i++) {
                 const px = xOff + Math.random() * this.chunkSize;
                 const pz = zOff + Math.random() * this.chunkSize;
                 // Visual variants: Police, Punk, Gang
                 const r = Math.random();
                 let faction = Faction.CIVILIAN;
                 if (r > 0.8) faction = Faction.POLICE;
                 else if (r > 0.6) faction = Faction.GANG;
                 
                 const ped = new Pedestrian(`ped_${cx}_${cz}_${i}`, new THREE.Vector3(px, 2, pz), faction);
                 this.pedestrians.push(ped);
                 this.scene.add(ped.mesh);
                 this.physics.addBody(ped.body);
              }
          }
          else if (biome === 'industrial') this.buildIndustrial(group, xOff, zOff, cx, cz);
          else this.buildSuburbs(group, xOff, zOff, cx, cz);
      }

      this.scene.add(group);
      this.chunks.set(`${cx},${cz}`, group);
  }

  buildRoads(group: THREE.Group, x: number, z: number, biome: string) {
      const rw = 16;
      if (biome !== 'industrial') {
        const sw = 22; 
        const swH = new THREE.Mesh(new THREE.PlaneGeometry(this.chunkSize, sw), this.materials.sidewalk);
        swH.rotation.x = -Math.PI/2;
        swH.position.set(x + this.chunkSize/2, 0.01, z + this.chunkSize/2);
        group.add(swH);

        const swV = new THREE.Mesh(new THREE.PlaneGeometry(sw, this.chunkSize), this.materials.sidewalk);
        swV.rotation.x = -Math.PI/2;
        swV.position.set(x + this.chunkSize/2, 0.015, z + this.chunkSize/2);
        group.add(swV);
      }

      const roadH = new THREE.Mesh(new THREE.PlaneGeometry(this.chunkSize, rw), this.materials.asphalt);
      roadH.rotation.x = -Math.PI/2;
      roadH.position.set(x + this.chunkSize/2, 0.02, z + this.chunkSize/2);
      roadH.receiveShadow = true;
      group.add(roadH);
      
      const roadV = new THREE.Mesh(new THREE.PlaneGeometry(rw, this.chunkSize), this.materials.asphalt);
      roadV.rotation.x = -Math.PI/2;
      roadV.position.set(x + this.chunkSize/2, 0.03, z + this.chunkSize/2);
      roadV.receiveShadow = true;
      group.add(roadV);
      
      const stripeGeo = new THREE.PlaneGeometry(4, 0.3);
      const stripeMat = new THREE.MeshBasicMaterial({color: 0xaaaaaa});
      for(let i=0; i<this.chunkSize; i+=8) {
           const s1 = new THREE.Mesh(stripeGeo, stripeMat);
           s1.rotation.x = -Math.PI/2;
           s1.position.set(x + i, 0.04, z + this.chunkSize/2);
           group.add(s1);
           
           const s2 = new THREE.Mesh(stripeGeo, stripeMat);
           s2.rotation.x = -Math.PI/2;
           s2.rotation.z = Math.PI/2;
           s2.position.set(x + this.chunkSize/2, 0.04, z + i);
           group.add(s2);
      }

      if (biome === 'city' || biome === 'suburbs') {
          this.addStreetLight(group, x + 5, z + this.chunkSize/2 + 10);
          this.addStreetLight(group, x + this.chunkSize - 5, z + this.chunkSize/2 - 10);
          this.addStreetLight(group, x + this.chunkSize/2 - 10, z + 5);
          this.addStreetLight(group, x + this.chunkSize/2 + 10, z + this.chunkSize - 5);
      }
  }

  addStreetLight(group: THREE.Group, x: number, z: number) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8), this.materials.lampPost);
      pole.position.set(x, 4, z);
      group.add(pole);
      this.physics.addStaticCollider(new THREE.Box3().setFromObject(pole));

      const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 0.2), this.materials.lampPost);
      arm.position.set(0, 4, 0); 
      pole.add(arm);

      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.3), this.materials.neonOrange);
      bulb.position.set(0.8, -0.2, 0);
      arm.add(bulb);

      const light = new THREE.PointLight(0xffaa00, 10, 30);
      light.position.set(0, -1, 0);
      bulb.add(light);
  }

  buildCityBlock(group: THREE.Group, x: number, z: number, cx: number, cz: number) {
      const positions = [[1,1], [1,-1], [-1,1], [-1,-1]];
      const bSize = 25;
      
      positions.forEach(([px, pz], i) => {
          const hash = Math.sin(cx * px + cz * pz + i);
          if (hash > -0.5) {
              const height = 20 + Math.abs(hash) * 60;
              
              const b = new THREE.Mesh(new THREE.BoxGeometry(bSize, height, bSize), this.materials.building);
              b.position.set(
                  x + this.chunkSize/2 + px * (this.chunkSize/4),
                  height/2,
                  z + this.chunkSize/2 + pz * (this.chunkSize/4)
              );
              b.castShadow = true;
              b.receiveShadow = true;
              group.add(b);
              this.physics.addStaticCollider(new THREE.Box3().setFromObject(b));
              
              if (Math.random() > 0.3) {
                  const stripH = new THREE.Mesh(new THREE.BoxGeometry(bSize + 0.2, 0.5, bSize + 0.2), 
                    Math.random() > 0.5 ? this.materials.neonBlue : this.materials.neonPink
                  );
                  stripH.position.y = height - 2;
                  b.add(stripH);
              }
              
              const winGeo = new THREE.PlaneGeometry(bSize - 2, height - 4);
              const win = new THREE.Mesh(winGeo, this.materials.glass);
              win.position.z = bSize/2 + 0.1;
              b.add(win);
          }
      });
  }

  buildIndustrial(group: THREE.Group, x: number, z: number, cx: number, cz: number) {
     const positions = [[1,1], [-1,-1]];
     positions.forEach(([px, pz]) => {
         const bx = x + this.chunkSize/2 + px * 20;
         const bz = z + this.chunkSize/2 + pz * 20;
         
         const tank = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 12, 16), this.materials.concrete);
         tank.position.set(bx, 6, bz);
         tank.castShadow = true;
         tank.receiveShadow = true;
         group.add(tank);
         this.physics.addStaticCollider(new THREE.Box3().setFromObject(tank));
     });
  }

  buildSuburbs(group: THREE.Group, x: number, z: number, cx: number, cz: number) {
     const positions = [[1,1], [1,-1], [-1,1], [-1,-1]];
     positions.forEach(([px, pz]) => {
         const bx = x + this.chunkSize/2 + px * 20;
         const bz = z + this.chunkSize/2 + pz * 20;
         
         if (Math.random() > 0.3) {
             const house = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), this.materials.sidewalk);
             house.position.set(bx, 4, bz);
             house.castShadow = true;
             house.receiveShadow = true;
             group.add(house);
             this.physics.addStaticCollider(new THREE.Box3().setFromObject(house));
             
             const roof = new THREE.Mesh(new THREE.ConeGeometry(9, 5, 4), new THREE.MeshStandardMaterial({color: 0x332222}));
             roof.position.y = 6.5;
             roof.rotation.y = Math.PI/4;
             house.add(roof);
         } else {
             const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3), new THREE.MeshStandardMaterial({color: 0x332211}));
             trunk.position.set(bx, 1.5, bz);
             group.add(trunk);
             const leaves = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 8), this.materials.grass);
             leaves.position.y = 4;
             trunk.add(leaves);
         }
     });
  }
}