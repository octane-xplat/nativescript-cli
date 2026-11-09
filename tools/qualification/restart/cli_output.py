"""Read actual xplat target-prefixed progress and PID-scoped runtime messages."""
from collections import Counter
import json
import re


ANDROID_LOG = re.compile(r'^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(\d+)\s+\d+\s+[VDIWEF]\s+JS\s*:\s*(.*)$')


class Output:
    def __init__(self, app, device, markers, target='ios'):
        if target not in ('ios', 'android'):
            raise ValueError('unsupported qualification target: ' + target)
        self.app, self.device, self.markers = app, device, markers
        self.target = target
        self.counts = Counter()
        self.samples = Counter()
        self.carry = ''

    def append(self, text):
        lines = (self.carry + text).split('\n')
        self.carry = lines.pop()
        for line in lines:
            if line.startswith('['):
                prefix = '[' + self.target + '] '
                if not line.startswith(prefix):
                    continue
                line = line[len(prefix):]
            if line == 'run: native stage-started':
                self.counts['compiles'] += 1
            if line == 'Successfully synced application ' + self.app + ' on device ' + self.device + '.':
                self.counts['launches'] += 1
            if self.target == 'android':
                entry = ANDROID_LOG.fullmatch(line)
                if entry:
                    for marker in self.markers:
                        if entry[2] == 'CONSOLE LOG: ' + marker:
                            self.samples[(marker, int(entry[1]))] += 1
                continue
            if not line.startswith('{'):
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if not isinstance(entry, dict):
                continue
            for marker in self.markers:
                if entry.get('eventMessage') == 'CONSOLE LOG: ' + marker and isinstance(entry.get('processID'), int):
                    self.samples[(marker, entry['processID'])] += 1
