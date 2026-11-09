import json
import unittest

from cli_output import Output


class OutputTests(unittest.TestCase):
    def test_real_target_prefix_and_fragmented_runtime_json(self):
        log = '[ios] run: native stage-started\n[ios] Successfully synced application org.example.probe on device exact.\n'
        log += ''.join('[ios] ' + json.dumps({'processID': 123, 'eventMessage': 'CONSOLE LOG: nonce'}) + '\n' for _ in range(3))
        for chunk_size in (1, 7, len(log)):
            output = Output('org.example.probe', 'exact', ['nonce'])
            for i in range(0, len(log), chunk_size):
                output.append(log[i:i + chunk_size])
            self.assertEqual(dict(output.counts), {'compiles': 1, 'launches': 1})
            self.assertEqual(output.samples[('nonce', 123)], 3)

    def test_source_text_and_old_process_cannot_supply_new_process_heartbeat(self):
        output = Output('app', 'device', ['nonce'])
        output.append("[ios] source: console.log('nonce')\n")
        output.append('[ios] ' + json.dumps({'eventMessage': 'CONSOLE LOG: nonce'}) + '\n')
        output.append('[ios] ' + json.dumps({'processID': 5, 'eventMessage': 'CONSOLE LOG: nonce'}) + '\n')
        self.assertEqual(output.samples[('nonce', 6)], 0)
        self.assertEqual(output.samples[('nonce', 5)], 1)
        self.assertEqual(dict(output.counts), {})

    def test_android_threadtime_pid_and_fragmented_target_output(self):
        log = '[android] run: native stage-started\n[android] Successfully synced application app on device emulator-5554.\n'
        log += '[android] 11-09 14:06:13.589  2255  2255 I JS      : CONSOLE LOG: nonce\n' * 3
        log += '[ios] run: native stage-started\n'
        log += '[android] source: console.log("nonce")\n'
        log += '[android] 11-09 14:06:13.589 2256 2256 I OtherTag : CONSOLE LOG: nonce\n'
        log += '[android] 11-09 14:06:13.589 2256 2256 I JS : CONSOLE LOG: nonce trailing\n'
        log += '[android] ' + json.dumps({'processID': 2256, 'eventMessage': 'CONSOLE LOG: nonce'}) + '\n'
        for chunk_size in (1, 7, len(log)):
            output = Output('app', 'emulator-5554', ['nonce'], target='android')
            for i in range(0, len(log), chunk_size):
                output.append(log[i:i + chunk_size])
            self.assertEqual(dict(output.counts), {'compiles': 1, 'launches': 1})
            self.assertEqual(output.samples[('nonce', 2255)], 3)
            self.assertEqual(output.samples[('nonce', 2256)], 0)


if __name__ == '__main__':
    unittest.main()
