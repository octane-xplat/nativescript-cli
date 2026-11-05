// Numeric-only diagnostics. Inset values are recorded only when the application
// naturally calls getSafeAreaInsets; observation never adds an inset query.
function safe<T>(read: () => T, fallback: T): T {
  try { return read(); } catch { return fallback; }
}
function frame(value: any) {
  return safe(() => {
    const result = { x: value.origin.x, y: value.origin.y,
      width: value.size.width, height: value.size.height };
    return Object.values(result).every(item => typeof item === 'number' && Number.isFinite(item)) ? result : null;
  }, null);
}
function state(view: any) {
  return { nativeFrame: safe(() => frame(view.nativeViewProtected.frame), null),
    cachedFrame: safe(() => frame(view._cachedFrame), null) };
}
function insets(value: any) {
  return safe(() => {
    const result = { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
    return Object.values(result).every(item => typeof item === 'number' && Number.isFinite(item)) ? result : null;
  }, null);
}

export function createLayoutTracer(getPhase: () => string, getLabel: () => any, trace: object[], limit = 80) {
  const traced = new WeakSet<object>();
  let calls = 0;
  return (view: any) => {
    if (!view || traced.has(view)) return;
    traced.add(view);
    for (const name of ['onMeasure', 'onLayout', '_masonLayoutForeignDescendants',
      '_setNativeViewFrame', '_modifyNativeViewFrame', 'applySafeAreaInsets', 'getSafeAreaInsets']) {
      const original = view[name];
      if (typeof original !== 'function') continue;
      view[name] = function (this: any, ...args: any[]) {
        const call = ++calls;
        const before = state(safe(getLabel, undefined));
        const receiverBefore = state(this);
        const requestedFrame = frame(name === 'applySafeAreaInsets' ? args[0] :
          name === '_setNativeViewFrame' || name === '_modifyNativeViewFrame' ? args[1] : undefined);
        const result = original.apply(this, args);
        const label = safe(getLabel, undefined);
        const after = state(label);
        trace.push({ phase: getPhase(), id: view.id, event: name, call,
          args: name === 'onMeasure' || name === 'onLayout' ? args.filter(value => typeof value === 'number' && Number.isFinite(value)) : [],
          measuredWidth: safe(() => label?.getMeasuredWidth(), undefined),
          measuredHeight: safe(() => label?.getMeasuredHeight(), undefined),
          width: safe(() => label?.width, undefined), height: safe(() => label?.height, undefined),
          nativeFrame: after.nativeFrame, before, after, receiverBefore, receiverAfter: state(this),
          requestedFrame, returnedFrame: name === 'applySafeAreaInsets' ? frame(result) : null,
          safeAreaInsetsDevicePixels: name === 'getSafeAreaInsets' ? insets(result) : null });
        if (trace.length > limit) trace.shift();
        return result;
      };
    }
  };
}
