"""Pad names and colours through the settings overlay: `python -m unittest
tests.test_pads` from daemon/."""
import json
import tempfile
import unittest
from pathlib import Path

from pioneertv import config, settings


class PadSettings(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.cfg = config._merge(config.DEFAULTS, {"_path": str(Path(self.dir.name) / "config.toml")})

    def tearDown(self):
        self.dir.cleanup()

    def test_stored_applied_and_reloaded(self):
        pads = {"8F12522651": {"name": "Rosa handkontroll", "pointer": "#f2c4bb", "accent": "#b4544b"}}
        settings.update(self.cfg, {"pads": pads})
        self.assertEqual(self.cfg["pads"], pads)
        saved = json.loads((Path(self.dir.name) / "settings.json").read_text())
        self.assertEqual(saved["pads"], pads)
        fresh = config._merge(config.DEFAULTS, {"_path": self.cfg["_path"]})
        settings.apply_overlay(fresh)
        self.assertEqual(fresh["pads"], pads)

    def test_colour_must_be_hex(self):
        with self.assertRaises(ValueError):
            settings.update(self.cfg, {"pads": {"X": {"name": "Rosa", "accent": "pink"}}})

    def test_values_and_services_untouched(self):
        settings.update(self.cfg, {"pads": {"X": {"name": "Grön"}}})
        self.assertNotIn("services", json.loads((Path(self.dir.name) / "settings.json").read_text()))


if __name__ == "__main__":
    unittest.main()
