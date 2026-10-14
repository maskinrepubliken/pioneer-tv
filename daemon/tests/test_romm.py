"""The /romm/ proxy rules and the RomM settings. Stdlib only: run with
`python3 -m unittest tests.test_romm` from daemon/."""
import unittest

from pioneertv import config, romm, settings

B = "http://romm:8090"


def config_with(overrides: dict) -> dict:
    return config._merge(config.DEFAULTS, overrides)


def find_field(described: dict, path: str) -> dict:
    for section in described["sections"]:
        for field in section["fields"]:
            if field["path"] == path:
                return field
    raise AssertionError(f"no field {path}")


class TargetUrl(unittest.TestCase):
    def test_api_path(self):
        self.assertEqual(romm.target_url(B, "api/platforms"), B + "/api/platforms")

    def test_query_kept(self):
        self.assertEqual(romm.target_url(B + "/", "api/roms", "limit=5"), B + "/api/roms?limit=5")

    def test_assets_path(self):
        self.assertEqual(romm.target_url(B, "assets/emulatorjs/data/loader.js"), B + "/assets/emulatorjs/data/loader.js")

    def test_other_paths_refused(self):
        for p in ["", "login", "api", "apix/a", "/api/x", "token"]:
            self.assertIsNone(romm.target_url(B, p), p)

    def test_dotdot_refused(self):
        for p in ["api/../login", "assets/%2e%2e/x", "api/a/..", "assets/..%2fx"]:
            self.assertIsNone(romm.target_url(B, p), p)

    def test_no_base(self):
        self.assertIsNone(romm.target_url("", "api/platforms"))


class RequestHeaders(unittest.TestCase):
    def test_headers_filtered_and_key_added(self):
        h = romm.request_headers({"content-type": "application/json", "Cookie": "x", "Origin": "y", "Range": "bytes=0-"}, "k1")
        self.assertEqual(h, {"Content-Type": "application/json", "Range": "bytes=0-", "Authorization": "Bearer k1"})


class Settings(unittest.TestCase):
    def test_settings_hide_key(self):
        cfg = config_with({"romm": {"url": B, "api_key": "secret"}})
        item = find_field(settings.describe(cfg), "romm.api_key")
        self.assertEqual((item["value"], item["is_set"]), ("", True))

    def test_url_shown(self):
        cfg = config_with({"romm": {"url": B, "api_key": ""}})
        self.assertEqual(find_field(settings.describe(cfg), "romm.url")["value"], B)


if __name__ == "__main__":
    unittest.main()
