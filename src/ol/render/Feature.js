/**
 * @module ol/render/Feature
 */
import {UNDEFINED} from '../functions.js';
import {extend} from '../array.js';
import {createOrUpdateFromCoordinate, createOrUpdateFromFlatCoordinates, getCenter, getHeight} from '../extent.js';
import GeometryType from '../geom/GeometryType.js';
import {linearRingss as linearRingssCenter} from '../geom/flat/center.js';
import {getInteriorPointOfArray, getInteriorPointsOfMultiArray} from '../geom/flat/interiorpoint.js';
import {interpolatePoint} from '../geom/flat/interpolate.js';
import {get as getProjection} from '../proj.js';
import {transform2D} from '../geom/flat/transform.js';
import {create as createTransform, compose as composeTransform} from '../transform.js';


/**
 * @type {module:ol/transform~Transform}
 */
const tmpTransform = createTransform();


/**
 * Lightweight, read-only, {@link module:ol/Feature~Feature} and {@link module:ol/geom/Geometry~Geometry} like
 * structure, optimized for vector tile rendering and styling. Geometry access
 * through the API is limited to getting the type and extent of the geometry.
 *
 * @param {module:ol/geom/GeometryType} type Geometry type.
 * @param {Array<number>} flatCoordinates Flat coordinates. These always need
 *     to be right-handed for polygons.
 * @param {Array<number>|Array<Array<number>>} ends Ends or Endss.
 * @param {Object.<string, *>} properties Properties.
 * @param {number|string|undefined} id Feature id.
 */
class RenderFeature {
  constructor(type, flatCoordinates, ends, properties, id) {
    /**
    * @private
    * @type {module:ol/extent~Extent|undefined}
    */
    this.extent_;

    /**
    * @private
    * @type {number|string|undefined}
    */
    this.id_ = id;

    /**
    * @private
    * @type {module:ol/geom/GeometryType}
    */
    this.type_ = type;

    /**
    * @private
    * @type {Array<number>}
    */
    this.flatCoordinates_ = flatCoordinates;

    /**
    * @private
    * @type {Array<number>}
    */
    this.flatInteriorPoints_ = null;

    /**
    * @private
    * @type {Array<number>}
    */
    this.flatMidpoints_ = null;

    /**
    * @private
    * @type {Array<number>|Array<Array<number>>}
    */
    this.ends_ = ends;

    /**
    * @private
    * @type {Object.<string, *>}
    */
    this.properties_ = properties;

  }

  /**
  * Get a feature property by its key.
  * @param {string} key Key
  * @return {*} Value for the requested key.
  * @api
  */
  get(key) {
    return this.properties_[key];
  }

  /**
  * Get the extent of this feature's geometry.
  * @return {module:ol/extent~Extent} Extent.
  * @api
  */
  getExtent() {
    if (!this.extent_) {
      this.extent_ = this.type_ === GeometryType.POINT ?
        createOrUpdateFromCoordinate(this.flatCoordinates_) :
        createOrUpdateFromFlatCoordinates(
          this.flatCoordinates_, 0, this.flatCoordinates_.length, 2);

    }
    return this.extent_;
  }

  /**
  * @return {Array<number>} Flat interior points.
  */
  getFlatInteriorPoint() {
    if (!this.flatInteriorPoints_) {
      const flatCenter = getCenter(this.getExtent());
      this.flatInteriorPoints_ = getInteriorPointOfArray(
        this.flatCoordinates_, 0, this.ends_, 2, flatCenter, 0);
    }
    return this.flatInteriorPoints_;
  }

  /**
  * @return {Array<number>} Flat interior points.
  */
  getFlatInteriorPoints() {
    if (!this.flatInteriorPoints_) {
      const flatCenters = linearRingssCenter(
        this.flatCoordinates_, 0, this.ends_, 2);
      this.flatInteriorPoints_ = getInteriorPointsOfMultiArray(
        this.flatCoordinates_, 0, this.ends_, 2, flatCenters);
    }
    return this.flatInteriorPoints_;
  }

  /**
  * @return {Array<number>} Flat midpoint.
  */
  getFlatMidpoint() {
    if (!this.flatMidpoints_) {
      this.flatMidpoints_ = interpolatePoint(
        this.flatCoordinates_, 0, this.flatCoordinates_.length, 2, 0.5);
    }
    return this.flatMidpoints_;
  }

  /**
  * @return {Array<number>} Flat midpoints.
  */
  getFlatMidpoints() {
    if (!this.flatMidpoints_) {
      this.flatMidpoints_ = [];
      const flatCoordinates = this.flatCoordinates_;
      let offset = 0;
      const ends = this.ends_;
      for (let i = 0, ii = ends.length; i < ii; ++i) {
        const end = ends[i];
        const midpoint = interpolatePoint(
          flatCoordinates, offset, end, 2, 0.5);
        extend(this.flatMidpoints_, midpoint);
        offset = end;
      }
    }
    return this.flatMidpoints_;
  }

  /**
  * Get the feature identifier.  This is a stable identifier for the feature and
  * is set when reading data from a remote source.
  * @return {number|string|undefined} Id.
  * @api
  */
  getId() {
    return this.id_;
  }

  /**
  * @return {Array<number>} Flat coordinates.
  */
  getOrientedFlatCoordinates() {
    return this.flatCoordinates_;
  }

  /**
  * For API compatibility with {@link module:ol/Feature~Feature}, this method is useful when
  * determining the geometry type in style function (see {@link #getType}).
  * @return {module:ol/render/Feature} Feature.
  * @api
  */
  getGeometry() {
    return this;
  }

  /**
  * Get the feature properties.
  * @return {Object.<string, *>} Feature properties.
  * @api
  */
  getProperties() {
    return this.properties_;
  }

  /**
  * @return {number} Stride.
  */
  getStride() {
    return 2;
  }

  /**
  * Get the type of this feature's geometry.
  * @return {module:ol/geom/GeometryType} Geometry type.
  * @api
  */
  getType() {
    return this.type_;
  }

  /**
  * Transform geometry coordinates from tile pixel space to projected.
  * The SRS of the source and destination are expected to be the same.
  *
  * @param {module:ol/proj~ProjectionLike} source The current projection
  * @param {module:ol/proj~ProjectionLike} destination The desired projection.
  */
  transform(source, destination) {
    source = getProjection(source);
    const pixelExtent = source.getExtent();
    const projectedExtent = source.getWorldExtent();
    const scale = getHeight(projectedExtent) / getHeight(pixelExtent);
    composeTransform(tmpTransform,
      projectedExtent[0], projectedExtent[3],
      scale, -scale, 0,
      0, 0);
    transform2D(this.flatCoordinates_, 0, this.flatCoordinates_.length, 2,
      tmpTransform, this.flatCoordinates_);
  }
}


/**
 * @return {Array<number>|Array<Array<number>>} Ends or endss.
 */
RenderFeature.prototype.getEnds =
RenderFeature.prototype.getEndss = function() {
  return this.ends_;
};


/**
 * @return {Array<number>} Flat coordinates.
 */
RenderFeature.prototype.getFlatCoordinates =
    RenderFeature.prototype.getOrientedFlatCoordinates;


/**
 * Get the feature for working with its geometry.
 * @return {module:ol/render/Feature} Feature.
 */
RenderFeature.prototype.getSimplifiedGeometry =
    RenderFeature.prototype.getGeometry;


/**
 * @return {undefined}
 */
RenderFeature.prototype.getStyleFunction = UNDEFINED;


export default RenderFeature;
