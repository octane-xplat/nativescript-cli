"""Repair only the pinned Vite diff's ambiguous new-side EOF annotation."""


def normalize_vite_eof(original, old_source=None):
    # The brace is EOF only in the new file. A context EOF annotation applies
    # to both sides; split equal delete/add lines to label each side precisely.
    prefix = b' }\n\\ No newline at end of file\n-//# sourceMappingURL=manifest-collect.js.map\n'
    marker = b'\\ No newline at end of file\n'
    if original.count(prefix) != 1:
        raise ValueError('Unsupported Vite EOF annotation shape')
    before, after = original.split(prefix)
    # 8.0.21's diff omits the old footer's EOF annotation. Derive it from
    # the actual old source instead of trusting that missing annotation.
    footer = b'//# sourceMappingURL=manifest-collect.js.map'
    if not isinstance(old_source, bytes) or not (old_source.endswith(footer) or old_source.endswith(footer + b'\n')):
        raise ValueError('Unsupported old Vite source-map footer')
    old_marker = b'' if old_source.endswith(b'\n') else marker
    if after.startswith(marker):
        after = after[len(marker):]
    replacement = b'-}\n-//# sourceMappingURL=manifest-collect.js.map\n' + old_marker + b'+}\n' + marker
    return before + replacement + after
