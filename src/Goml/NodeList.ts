// solufa element class

import * as THREE from "three";
import BaseNode from "./BaseNode";
import createMaterial from "./createMaterial";
import createGeometry from "./createGeometry";
import errorMessage from "../utils/errorMessage";
import { setCoreObject as setObject } from "./adminCoreObject";
import RdrNode from "./RdrNode";
import VpNode from "./VpNode";

// 以下二つは廃止予定
import physics from "./physics";
import getAsset from "./getAsset";

const tmpVec = new THREE.Vector3; // for translate

class GomlNode extends BaseNode {
  private _coreObject;
  private _lightHelper;
  private _cameraHelper;

  // coreObject = three.js object
  get coreObject() {
    return this._coreObject;
  }
  set coreObject( object ) {
    this._coreObject = object;
    setObject( this );
  }

  public setAttrHook( name, value ) {
    switch ( name ) {
    case "display":
      this.coreObject.visible = value !== false;
      break;
    case "rotateOrder":
      this.coreObject.rotation.order = value;
      break;
    case "renderOrder":
      this.coreObject.renderOrder = value;
      break;
    case "castShadow":
    case "receiveShadow":
      this.coreObject[ name ] = !!value;
      break;
    }
  }

  public getAttrHook( name ) {
    switch ( name ) {
    case "display":
      return this.coreObject.visible;
    case "rotateOrder":
      return this.coreObject.rotation.order;
    case "renderOrder":
      return this.coreObject.renderOrder;
    case "castShadow":
    case "receiveShadow":
      return this.coreObject[ name ];
    default:
      return super.getAttrHook( name );
    }
  }

  public getScene() {
    let scene = this;

    while ( scene.tagName !== "scene" ) {
      scene = scene.parentNode;
    }

    return scene;
  }

  public appendHook( childNode ) {// m.redrawとかでMithrilがtextNodeを生成することがある
    if ( childNode.coreObject instanceof THREE.Object3D ) {
      this.coreObject.add( childNode.coreObject );
    }
  }

  public removeHook( childNode ) {
    if ( childNode.coreObject instanceof THREE.Object3D ) {
      this.coreObject.remove( childNode.coreObject );
    }
  }

  public setHelper( type, object ) {
    if ( object ) {
      const helper = new THREE[ type + "Helper" ]( object );
      this.coreObject.add( helper );
      if ( type === "Camera" ) {
        this._cameraHelper = helper;
      } else {
        this._lightHelper = helper;
      }
    } else {
      let helper;
      if ( type === "Camera" ) {
        helper = this._cameraHelper;
        delete this._cameraHelper;
      } else {
        helper = this._lightHelper;
        delete this._lightHelper;
      }
      this.coreObject.remove( helper );
    }
  }

  // translate系は現在のpositionとrotateが基準なのでstyleで表現できない
  public translate( x, y, z ) {
    tmpVec.set( x, y, z );
    let length = tmpVec.length();
    this.coreObject.translateOnAxis( tmpVec.normalize(), length );
  }

  public translateX( distance ) {
    this.coreObject.translateX( distance );
  }

  public translateY( distance ) {
    this.coreObject.translateY( distance );
  }

  public translateZ( distance ) {
    this.coreObject.translateZ( distance );
  }

}

// three.js lightクラスの省略名を保持
let lightType = {};
for ( let key in THREE ) {
  if ( /.+?Light$/.test( key ) ) {
    lightType[ key.slice( 0, 3 ) ] = key;
  }
}


export default {

  // 仕様が不安定なので廃止予定
  asset: class extends GomlNode {

    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );

      if ( name === "src" ) {
        if ( !/\//.test( value ) ) {
          errorMessage( "src attribute of asset must be full, absolute or relative path." );
        } else {
          getAsset( this, value );
        }
      }
    }

    constructor( gomlDoc ) {
      super( "asset", gomlDoc );
      this.coreObject = new THREE.Object3D;
    }
  },

  body: class extends BaseNode {
    constructor( gomlDoc ) {
      super( "body", gomlDoc );
    }
  },

  cam: class extends GomlNode {

    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );

      if ( /^(fov|near|far)$/.test( name ) ) {
        this.coreObject[ name ] = value;
        this.coreObject.updateProjectionMatrix();
      }
    }

    constructor( gomlDoc ) {
      super( "cam", gomlDoc );
      this.coreObject = new THREE.PerspectiveCamera;
    }
  },

  head: class extends BaseNode {
    constructor( gomlDoc ) {
      super( "head", gomlDoc );
    }
  },

  light: class extends GomlNode {

    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );

      switch ( name ) {
      case "init":
        if ( this.coreObject ) { break; }
        let param = value.value || [];
        this.coreObject = new THREE[ lightType[ value.type ] ]( param[ 0 ], param[ 1 ], param[ 2 ], param[ 3 ], param[ 4 ], param[ 5 ] );
        break;
      case "helper":
        if ( !this.coreObject ) { break; }
        this.setHelper( lightType[ this.getAttribute( "init" ).type ], value && this.coreObject );
        if ( this.getAttribute( "castShadow" ) ) {
          this.setHelper( "Camera", value && this.coreObject.shadow.camera );
        }
        break;
      case "castShadow":
        if ( typeof value === "object" ) {
          const shadow = this.coreObject.shadow;
          for ( let key in value ) {
            if ( key === "mapSize" ) {
              shadow.mapSize.width =
              shadow.mapSize.height = value[ key ];
            } else if ( key === "bias" ) {
              shadow.bias = value[ key ];
            } else {
              shadow.camera[ key ] = value[ key ];
            }
          }
        }
        break;
      }
    }

    constructor( gomlDoc ) {
      super( "light", gomlDoc );
    }
  },

  line: class extends GomlNode {

    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );

      switch ( name ) {
      case "geo":
        this.coreObject.geometry = createGeometry( value );
        break;

      case "mtl":
        this.coreObject.material = createMaterial( value );
        break;
      }
    }

    constructor( gomlDoc ) {
      super( "line", gomlDoc );
      this.coreObject = new THREE.Line;
    }
  },

  mesh: class extends GomlNode {

    private _physicsStyleNeedsUpdate = false;

    get physicsStyleNeedsUpdate() {
      return this._physicsStyleNeedsUpdate;
    }
    set physicsStyleNeedsUpdate( bool ) {
      this._physicsStyleNeedsUpdate = bool;
      if ( bool ) { physics.styleUpdate( this ); }
    }

    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );

      switch ( name ) {
      case "geo":
        this.coreObject.geometry = createGeometry( value );
        break;

      case "mtl":
        this.coreObject.material = createMaterial( value );
        break;
      }
    }

    public appendedHook() {
      if ( this.getAttribute( "physics" ) ) {
        physics.addElement( this, this.getAttribute( "physics" ) );
      }
    }

    public removedHook() {
      if ( this.getAttribute( "physics" ) ) {
        physics.removeElement( this );
      }
    }

    constructor( gomlDoc ) {
      super( "mesh", gomlDoc );
      this.coreObject = new THREE.Mesh;
    }
  },

  // あまり覚えてないけどモデルローダーで使う予定だったはず。asset elementとともに廃止
  meshes: class extends GomlNode {

    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );
      let n = 0;

      switch ( name ) {
      case "geos":
        let mtls = this.getAttribute( "mtls" );
        if ( !Array.isArray( value ) || !mtls ) {
          return;
        }

        while ( n < value.length ) {
          this.coreObject.add( new THREE.Mesh( createGeometry( value[ n ] ), createMaterial( mtls[ n ] ) ) );
          n = n + 1;
        }
        break;

      case "mtls":
        let geos = this.getAttribute( "geos" );

        while ( n < value.length ) {
          createMaterial( value[ n ] ); // txrをロードしておく

          if ( Array.isArray( geos ) && !this.childNodes.length ) {
            this.coreObject.add( new THREE.Mesh( createGeometry( geos[ n ] ), createMaterial( value[ n ] ) ) );
          }
          n = n + 1;
        }
        break;
      }
    }

    constructor( gomlDoc ) {
      super( "meshes", gomlDoc );
      this.coreObject = new THREE.Object3D;
    }
  },

  // 3D用のdivとして扱える
  obj: class extends GomlNode {

    constructor( gomlDoc ) {
      super( "obj", gomlDoc );
      this.coreObject = new THREE.Object3D;
    }
  },

  ocam: class extends GomlNode {

    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );

      if ( /^(zoom|near|far)$/.test( name ) ) {
        this.coreObject[ name ] = value;
        this.coreObject.updateProjectionMatrix();
      } else if ( name === "width" ) {
        this.coreObject.left = value / - 2;
        this.coreObject.right = value / 2;
        this.coreObject.updateProjectionMatrix();
      } else if ( name === "height" ) {
        this.coreObject.top = value / 2;
        this.coreObject.bottom = value / - 2;
        this.coreObject.updateProjectionMatrix();
      }
    }

    constructor( gomlDoc ) {
      super( "ocam", gomlDoc );
      this.coreObject = new THREE.OrthographicCamera( -1, 1, 1, -1 );
    }
  },

  points: class extends GomlNode {

    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );

      switch ( name ) {
      case "geo":
        this.coreObject.geometry = createGeometry( value );
        break;

      case "mtl":
        this.coreObject.material = createMaterial( value );
        break;
      }
    }

    constructor( gomlDoc ) {
      super( "points", gomlDoc );
      this.coreObject = new THREE.Points;
    }
  },

  rdr: RdrNode,

  rdrs: class extends BaseNode {
    constructor( gomlDoc ) {
      super( "rdrs", gomlDoc );
    }
  },

  scene: class extends GomlNode {
    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );

      if ( name === "physicsWorld" ) {
        physics.createWorld( this, value );
      }
    }

    constructor( gomlDoc ) {
      super( "scene", gomlDoc );
      this.coreObject = new THREE.Scene;
    }
  },

  scenes: class extends BaseNode {
    constructor( gomlDoc ) {
      super( "scenes", gomlDoc );
    }
  },

  sprite: class extends GomlNode {

    public setAttrHook( name: string, value ): void {
      super.setAttrHook( name, value );

      switch ( name ) {
      case "mtl":
        this.coreObject.material = createMaterial( value );
        break;
      }
    }

    constructor( gomlDoc ) {
      super( "sprite", gomlDoc );
      this.coreObject = new THREE.Sprite;
    }
  },

  vp: VpNode,

  vps: class extends BaseNode {

    public appendHook( childNode ) {
      childNode.setSize( this.parentNode.canvas.width, this.parentNode.canvas.height );
    }

    constructor( gomlDoc ) {
      super( "vps", gomlDoc );
    }
  },
};
