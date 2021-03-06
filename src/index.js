import { isObject, isFunction } from 'toxic-predicate-functions';

 /**
 * @module event
 * @author huzunjie
 * @description 自定义事件基础类
 */

/* 缓存事件监听方法及包装，内部数据格式：
 * targetIndex_<type:'click|mouseup|done'>: [ [
 *   function(){ ... handler ... },
 *   function(){ ... handlerWrap ... handler.apply(target, arguments) ... },
 *   isOnce
 * ]]
 */
const _evtListenerCache = Object.create(null);
_evtListenerCache.count = 0;

/**
 * 得到某对象的某事件类型对应的监听队列数组
 * @param  {Object}  target 发生事件的对象
 * @param {String} type 事件类型(这里的时间类型不只是名称，还是缓存标识，可以通过添加后缀来区分)
 * @return {Array}
 */
function getEvtTypeCache (target, type) {

  let evtId = target.__evt_id;
  if (!evtId) {

    /* 设置__evt_id不可枚举 */
    Object.defineProperty(target, '__evt_id', {
      writable: true,
      enumerable: false,
      configurable: true
    });

    /* 空对象初始化绑定索引 */
    evtId = target.__evt_id = ++_evtListenerCache.count;
  }

  const typeCacheKey = evtId + '_' + type;
  let evtTypeCache = _evtListenerCache[typeCacheKey];
  if (!evtTypeCache) {
    evtTypeCache = _evtListenerCache[typeCacheKey] = [];
  }

  return evtTypeCache;
}

/**
 * 触发事件监听方法
 * @param  {Object}  target 发生事件的对象
 * @param {String} type 事件类型
 * @param {Object} eventObj 触发事件时要传回的event对象
 * @return {undefined}
 */
export function emitEventCache (target, type, eventObj) {
  const evt = Object.create(null);
  evt.type = type;
  evt.target = target;
  if (eventObj) {
    Object.assign(evt, isObject(eventObj) ? eventObj : { data: eventObj });
  }
  getEvtTypeCache(target, type).forEach(item => {
    (item[1] || item[0]).apply(target, [ evt ]);
  });
}

/**
 * 添加事件监听到缓存
 * @param  {Object}  target 发生事件的对象
 * @param {String} type 事件类型
 * @param {Function} handler 监听函数
 * @param {Boolean} isOnce 是否单次执行
 * @param {Function} handlerWrap
 * @return {undefined}
 */
export function addEventCache (target, type, handler, isOnce = false, handlerWrap) {
  if (isFunction(isOnce) && !handlerWrap) {
    handlerWrap = isOnce;
    isOnce = undefined;
  }
  const handlers = [ handler, undefined, isOnce ];
  if (isOnce && !handlerWrap) {
    handlerWrap = function (...args) {
      removeEventCache(target, type, handler, isOnce);
      handler.apply(target, args);
    };
  }
  if (handlerWrap) {
    handlers[1] = handlerWrap;
  }
  getEvtTypeCache(target, type).push(handlers);
}

/**
 * 移除事件监听
 * @param  {Object}  target 发生事件的对象
 * @param {String} type 事件类型
 * @param {Function} handler 监听函数
 * @return {undefined}
 */
export function removeEventCache (target, type, handler, isOnce = false) {
  const typeCache = getEvtTypeCache(target, type);

  if (handler || isOnce) {
    /* 有指定 handler 则清除对应监听 */
    let handlerId = -1;
    let handlerWrap;
    typeCache.find((item, i) => {
      if ((!handler || item[0] === handler) && (!isOnce || item[2])) {
        handlerId = i;
        handlerWrap = item[1];
        return true;
      }
    });
    if (handlerId !== -1) {
      typeCache.splice(handlerId, 1);
    }
    return handlerWrap;

  } else {
    /* 未指定 handler 则清除type对应的所有监听 */
    typeCache.length = 0;
  }
}

/**
 * @class CustEvent
 * @description
 * Event 自定义事件类
 * 1. 可以使用不传参得到的实例作为eventBus使用
 * 2. 可以通过指定target，用多个实例操作同一target对象的事件管理
 * 3. 当设定target时，可以通过设置assign为true，来给target实现"on\once\off\emit"方法
 * @param  {Object}  target 发生事件的对象（空则默认为event实例）
 * @param  {Boolean}  assign 是否将"on\once\off\emit"方法实现到target对象上
 * @return {event}
 */
export class CustEvent {
  constructor (target, assign) {
    /* 设置__target不可枚举 */
    Object.defineProperty(this, '__target', {
      writable: true,
      enumerable: false,
      configurable: true
    });
    this.__target = this;

    if (target) {

      if (typeof target !== 'object') {
        throw new Error('CusEvent target are not object');
      }
      this.__target = target;

      /* 为target实现on\once\off\emit */
      if (assign) {
        ['on', 'once', 'off', 'emit'].forEach(mth => {
          target[mth] = this[mth];
        });
      }
    }
  }

  /**
   * 添加事件监听
   * @param {String} type 事件类型
   * @param {Function} handler 监听函数
   * @param {Boolean} isOnce 单次监听类型
   * @return {event}
   */
  on (type, handler, isOnce = false) {
    addEventCache(this.__target, type, handler, isOnce);
    return this;
  }

  /**
   * 添加事件监听,并且只执行一次
   * @param {String} type 事件类型
   * @param {Function} handler 监听函数
   * @return {event}
   */
  once (type, handler) {
    return this.on(type, handler, true);
  }

  /**
   * 移除事件监听
   * @param {String} type 事件类型
   * @param {Function} handler 监听函数(不指定handler则清除type对应的所有事件监听)
   * @param {Boolean} isOnce 单次监听类型
   * @return {event}
   */
  off (type, handler, isOnce = false) {
    removeEventCache(this.__target, type, handler, isOnce);
    return this;
  }

  /**
   * 触发事件监听函数
   * @param {String} type 事件类型
   * @return {event}
   */
  emit (type, data) {
    emitEventCache(this.__target, type, { data });
    return this;
  }
}
