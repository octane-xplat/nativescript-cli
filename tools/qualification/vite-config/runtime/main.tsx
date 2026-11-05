import { Application, File, Page, knownFolders } from '@nativescript/core';
import { renderNativeScriptApp } from '@nativescript-community/octane';
import { Probe } from '../../../packages/app/src/runtime-probe';
import { nonce } from './runtime-nonce';
import './runtime.css';

const boot = String(Date.now()) + ':' + String(Math.random());
const file = File.fromPath(knownFolders.documents().path + '/go-preset-health.json');
const snapshots: object[] = [];
let page: Page;
let root: ReturnType<typeof renderNativeScriptApp>;
let phase = 'mount';
let ticks = 0;
let phaseTicks = 0;
let failure = '';

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
    const sample = { phase, ticks, text: label?.text, className: label?.className,
      loaded: !!label?.isLoaded, nativeView: !!label?.nativeViewProtected,
      color: label?.color ? [label.color.r, label.color.g, label.color.b] : null,
      marginTop: label?.marginTop, marginLeft: label?.marginLeft };
    const ready = label?.isLoaded && label?.nativeViewProtected &&
      label.color?.r === 18 && label.color?.g === 52 && label.color?.b === 86 &&
      label.marginTop === 13 && label.marginLeft === 13;
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
    file.writeTextSync(JSON.stringify({ nonce, boot, pid: NSProcessInfo.processInfo.processIdentifier,
      ticks, phase, phaseTicks, sample, snapshots, failure }));
  } catch (error) {
    failure = String(error);
    file.writeTextSync(JSON.stringify({ nonce, boot, ticks, phase, failure }));
  }
}, 250);
