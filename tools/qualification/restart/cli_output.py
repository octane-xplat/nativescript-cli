"""Read actual xplat target-prefixed progress and PID-scoped runtime messages."""
from collections import Counter
import json


class Output:
    def __init__(self, app, device, markers):
        self.app, self.device, self.markers = app, device, markers
        self.counts = Counter()
        self.samples = Counter()
        self.carry = ''

    def append(self, text):
        lines = (self.carry + text).split('\n')
        self.carry = lines.pop()
        for line in lines:
            if line.startswith('[ios] '):
                line = line[len('[ios] '):]
            if line == 'run: native stage-started':
                self.counts['compiles'] += 1
            if line == 'Successfully synced application ' + self.app + ' on device ' + self.device + '.':
                self.counts['launches'] += 1
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
