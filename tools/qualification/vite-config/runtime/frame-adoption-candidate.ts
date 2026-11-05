// Diagnostic candidate for the iOS Mason foreign-child boundary, not a shipped
// dependency fix. Native/transform/lifecycle controls remain required.
export function adoptMasonForeignFrame(parent: any, child: any, measureChild: Function, layout: any) {
  const native = child.nativeViewProtected;
  const bounds = native.bounds, layer = native.layer;
  const width = bounds.size.width, height = bounds.size.height;
  const x = layer.position.x - width * layer.anchorPoint.x;
  const y = layer.position.y - height * layer.anchorPoint.y;
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) {
    throw Error('Invalid native foreign-child geometry');
  }
  // UIKit frame may be a transformed bounding box. Core caches the requested
  // untransformed rectangle, quantized to device pixels by its normal helpers.
  const pixel = (value: number) => layout.round(layout.toDevicePixels(value));
  const left = pixel(x), top = pixel(y), right = pixel(x + width), bottom = pixel(y + height);
  const requested = { x: layout.toDeviceIndependentPixels(left), y: layout.toDeviceIndependentPixels(top),
    width: layout.toDeviceIndependentPixels(right - left), height: layout.toDeviceIndependentPixels(bottom - top) };
  const previous = child._modifyNativeViewFrame;
  if (typeof previous !== 'function') throw Error('Foreign child lacks Core frame boundary');
  const descriptor = Object.getOwnPropertyDescriptor(child, '_modifyNativeViewFrame');
  Object.defineProperty(child, '_modifyNativeViewFrame', { configurable: true, writable: true,
    enumerable: descriptor?.enumerable ?? false,
    value: function (this: any, view: any, frame: any) {
      // Delegate any different receiver or request. Only the exact frame already
      // owned by this Mason pass is adopted; unrelated Core writes remain normal.
      if (this !== child || view !== native || frame.origin.x !== requested.x || frame.origin.y !== requested.y ||
          frame.size.width !== requested.width || frame.size.height !== requested.height) {
        return previous.apply(this, arguments);
      }
      native.layoutIfNeeded();
    } });
  try {
    measureChild(parent, child, layout.makeMeasureSpec(right - left, layout.EXACTLY),
      layout.makeMeasureSpec(bottom - top, layout.EXACTLY));
    // Normal Core layout still owns cache, onLayout, background and events.
    child.layout(left, top, right, bottom);
  } finally {
    if (descriptor) Object.defineProperty(child, '_modifyNativeViewFrame', descriptor);
    else delete child._modifyNativeViewFrame;
  }
}
