import { Application, File, Page, knownFolders } from '@nativescript/core';
import { renderNativeScriptApp } from '@nativescript-community/octane';
import { View as MasonView } from '@octane-xplat/nativescript-mason-core';
import { Probe } from '../../../packages/app/src/runtime-probe';
import { nonce, profile } from './runtime-nonce';
import './runtime.css';
import { createLayoutTracer } from './layout-trace';

const boot = String(Date.now()) + ':' + String(Math.random());
const file = File.fromPath(knownFolders.documents().path + '/go-preset-health.json');
const snapshots: object[] = [];
let page: Page;
let root: ReturnType<typeof renderNativeScriptApp>;
let phase = 'mount';
let ticks = 0;
let phaseTicks = 0;
let failure = '';
const trace: object[] = [];
const traceLayout = createLayoutTracer(() => phase, () => page?.getViewById('preset-probe'), trace);

function layoutSample() {
  const container = page?.getViewById('mason-probe') as any;
  const rect = (view: any) => {
    const size = view?.getActualSize();
    const location = container && view?.getLocationRelativeTo(container);
    return { width: size?.width, height: size?.height, x: location?.x, y: location?.y };
  };
  return { containerIsMason: container instanceof MasonView, containerNative: !!container?.nativeViewProtected,
    container: rect(container), first: rect(page?.getViewById('preset-probe')),
    second: rect(page?.getViewById('mason-sibling')) };
}
function layoutReady(layout: ReturnType<typeof layoutSample>) {
  const updated = phase === 'update';
  const near = (value: number | undefined, expected: number) => typeof value === 'number' && Math.abs(value - expected) < 0.75;
  return layout.containerIsMason && layout.containerNative &&
    near(layout.container.width, updated ? 220 : 200) && near(layout.container.height, updated ? 160 : 140) &&
    near(layout.first.x, 20) && near(layout.first.y, 20) &&
    near(layout.first.width, updated ? 100 : 80) && near(layout.first.height, updated ? 40 : 30) &&
    near(layout.second.x, 7) && near(layout.second.y, updated ? 73 : 63) &&
    near(layout.second.width, 60) && near(layout.second.height, 20);
}

Application.run({ create() {
  page = new Page();
  page.actionBarHidden = true;
  page.className = 'ns-root';
  root = renderNativeScriptApp(page, Probe, { revision: 1 });
  return page;
} });

setInterval(() => {
  try {
    ticks++;
    phaseTicks++;
    const label = page?.getViewById('preset-probe') as any;
    if (profile === 'mason') {
      traceLayout(label);
      traceLayout(page?.getViewById('mason-probe'));
    }
    const layout = profile === 'mason' ? layoutSample() : undefined;
    const sample = { phase, ticks, text: label?.text, className: label?.className, layout,
      loaded: !!label?.isLoaded, nativeView: !!label?.nativeViewProtected,
      color: label?.color ? [label.color.r, label.color.g, label.color.b] : null,
      marginTop: label?.marginTop, marginLeft: label?.marginLeft };
    const ready = label?.isLoaded && label?.nativeViewProtected &&
      label.color?.r === 18 && label.color?.g === 52 && label.color?.b === 86 &&
      label.marginTop === 13 && label.marginLeft === 13 && (!layout || layoutReady(layout));
    if (phase === 'mount' && ready && label.text === 'PINNED_PRESET_20261105:1' && phaseTicks >= 4) {
      snapshots.push(sample);
      root.render(Probe as never, { revision: 2 });
      phase = 'update'; phaseTicks = 0;
    } else if (phase === 'update' && ready && label.text === 'PINNED_PRESET_20261105:2' && phaseTicks >= 4) {
      snapshots.push(sample);
      root.unmount(); phase = 'unmount'; phaseTicks = 0;
    } else if (phase === 'unmount' && !label && !page.content && phaseTicks >= 4) {
      snapshots.push(sample);
      root = renderNativeScriptApp(page, Probe, { revision: 3 });
      phase = 'remount'; phaseTicks = 0;
    } else if (phase === 'remount' && ready && label.text === 'PINNED_PRESET_20261105:3' && phaseTicks >= 4) {
      snapshots.push(sample);
      phase = 'complete'; phaseTicks = 0;
    }
    file.writeTextSync(JSON.stringify({ nonce, profile, boot, pid: NSProcessInfo.processInfo.processIdentifier,
      ticks, phase, phaseTicks, sample, snapshots, trace, failure }));
  } catch (error) {
    failure = String(error);
    file.writeTextSync(JSON.stringify({ nonce, boot, ticks, phase, failure }));
  }
}, 250);
