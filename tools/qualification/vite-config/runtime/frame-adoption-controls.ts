// Actual UIKit controls injected only into the owned diagnostic application.
declare const CGRectMake: (x: number, y: number, width: number, height: number) => any;
declare const CGPointMake: (x: number, y: number) => any;
export function runMasonFrameAdoptionControls(page: any, Label: any) {
  const label = page.getViewById('preset-probe'), container = page.getViewById('mason-probe');
  const records: object[] = [];
  const result = { passed: false, error: '', records, restored: false,
    scope: 'Actual retained-native UIKit geometry, events and ordinary Core safe area; diagnostic candidate, no production acceptance' };
  const native = label.nativeViewProtected;
  const rect = (r: any) => ({ x: r.origin.x, y: r.origin.y, width: r.size.width, height: r.size.height });
  const snapshot = () => ({ frame: rect(native.frame), bounds: rect(native.bounds),
    position: { x: native.layer.position.x, y: native.layer.position.y },
    anchor: { x: native.layer.anchorPoint.x, y: native.layer.anchorPoint.y },
    transform: Object.fromEntries(Array.from({ length: 16 }, (_, n) => {
      const key = 'm' + (1 + Math.floor(n / 4)) + (1 + n % 4); return [key, native.layer.transform[key]];
    })), cached: rect(label._cachedFrame) });
  const saved = snapshot(), style = { x: label.scaleX, y: label.scaleY, rotate: label.rotate };
  const oldModifier = Object.getOwnPropertyDescriptor(label, '_modifyNativeViewFrame');
  let events = 0;
  const listener = () => { events++; };
  const equal = (a: any, b: any): boolean => typeof a === 'number' && typeof b === 'number' ?
    Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-6 :
    a && b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => equal(a[key], b[key]));
  const require = (condition: any, message: string) => { if (!condition) throw Error(message); };
  function run(name: string, setup: () => void) {
    setup();
    const before = snapshot(), count = events;
    const density = label.getMeasuredWidth() / before.bounds.width;
    require(Number.isFinite(density) && density > 0, 'Missing measured density');
    const left = Math.round((before.position.x - before.bounds.width * before.anchor.x) * density);
    const top = Math.round((before.position.y - before.bounds.height * before.anchor.y) * density);
    const expected = { x: left / density, y: top / density,
      width: (Math.round((before.position.x + before.bounds.width * (1 - before.anchor.x)) * density) - left) / density,
      height: (Math.round((before.position.y + before.bounds.height * (1 - before.anchor.y)) * density) - top) / density };
    container._masonLayoutForeignDescendants();
    const after = snapshot(), eventsAfterFirst = events;
    container._masonLayoutForeignDescendants();
    const repeated = snapshot();
    records.push({ name, before, after, repeated, expectedCache: expected, events: eventsAfterFirst - count, repeatedEvents: events - eventsAfterFirst });
    for (const key of ['frame', 'bounds', 'position', 'anchor', 'transform'] as const) {
      require(equal(before[key], after[key]) && equal(after[key], repeated[key]), name + ': native ' + key + ' changed');
    }
    require(equal(after.cached, expected) && equal(repeated.cached, expected), name + ': stale/unexpected Core cache');
    require(eventsAfterFirst - count === (equal(before.cached, expected) ? 0 : 1), name + ': first layoutChanged count');
    require(events === eventsAfterFirst, name + ': repeated layoutChanged');
    const descriptor = Object.getOwnPropertyDescriptor(label, '_modifyNativeViewFrame');
    require(descriptor?.value === oldModifier?.value && descriptor?.get === oldModifier?.get,
      name + ': frame boundary ownership changed');
  }
  label.on('layoutChanged', listener);
  try {
    run('unchanged-repeated-layout', () => {});
    run('scale-and-rotation', () => { label.scaleX = 1.25; label.scaleY = 0.75; label.rotate = 23; });
    run('transformed-bounds-origin-and-anchor', () => {
      const b = native.bounds;
      native.bounds = CGRectMake(3, 7, b.size.width, b.size.height);
      native.layer.anchorPoint = CGPointMake(0.25, 0.75);
    });
    result.passed = true;
  } catch (error) { result.error = String(error); }
  finally {
    label.off('layoutChanged', listener);
    try {
      label.scaleX = style.x; label.scaleY = style.y; label.rotate = style.rotate;
      native.bounds = CGRectMake(saved.bounds.x, saved.bounds.y, saved.bounds.width, saved.bounds.height);
      native.layer.anchorPoint = CGPointMake(saved.anchor.x, saved.anchor.y);
      native.layer.position = CGPointMake(saved.position.x, saved.position.y);
      container._masonLayoutForeignDescendants();
      result.restored = equal(snapshot(), saved);
      require(result.restored, 'Control geometry did not restore');
    } catch (error) { result.passed = false; result.error += ' restore: ' + String(error); }
  }
  if (result.passed) {
    // The four Mason lifecycle snapshots are complete. Replace only this owned
    // probe's content with a plain Core Label to test normal clipping separately.
    const outside = new Label();
    outside.id = 'preset-probe'; outside.text = 'NORMAL_CORE_SAFE_AREA_CONTROL';
    page.content = outside;
    let natural: any = null, calls = 0;
    const old = Object.getOwnPropertyDescriptor(outside, 'getSafeAreaInsets');
    const getInsets = outside.getSafeAreaInsets;
    outside.getSafeAreaInsets = function () { calls++; const value = getInsets.call(this); natural = { ...value }; return value; };
    try {
      require(outside.parent === page && !outside.parent._masonLayoutForeignDescendants && outside.nativeViewProtected,
        'Normal Core control must be attached outside Mason');
      let positive = false;
      for (const top of [0, -300]) {
        natural = null; calls = 0;
        outside.layout(0, top, 300, 600);
        const after = rect(outside.nativeViewProtected.frame);
        const record = { name: 'non-Mason-Core-safe-area', requestedDevicePixels: { left: 0, top, right: 300, bottom: 600 },
          naturalInsetsDevicePixels: natural, naturalCalls: calls, after, loaded: outside.isLoaded, parentIsPage: outside.parent === page };
        records.push(record);
        const density = 3; // This exact retained arm64 iPhone probe is independently measured at density3.
        if (natural?.top > 0) {
          require(calls > 0 && outside.isLoaded, 'Normal Core native view must be loaded and query natural insets');
          require(Math.abs(after.y - (top + natural.top) / density) < 1e-6 &&
            Math.abs(after.height - Math.max(0, (600 - top - natural.top - natural.bottom) / density)) < 1e-6,
          'Ordinary Core positive-inset clipping changed');
          positive = true; break;
        }
      }
      require(positive, 'No actual positive non-Mason safe-area sample observed');
    } catch (error) { result.passed = false; result.error = String(error); }
    finally {
      if (old) Object.defineProperty(outside, 'getSafeAreaInsets', old);
      else delete outside.getSafeAreaInsets;
    }
  }
  return result;
}
