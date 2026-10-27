"""The /jellyfin/ proxy rules. Stdlib only: run with
`python3 -m unittest tests.test_jellyfin` from daemon/."""
import unittest

from pioneertv import jellyfin

B = "http://jf:8096"


class TargetUrl(unittest.TestCase):
    def test_library_reads(self):
        for p in ["Items", "Items/abc/Images/Primary", "Users/u1/Items", "Playlists/p1/Items", "Artists/AlbumArtists",
                  "Search/Hints", "Audio/a1/universal", "UserViews", "UserItems/Resume", "Shows/s1/Seasons",
                  "Shows/s1/Episodes"]:
            self.assertEqual(jellyfin.target_url(B, p), f"{B}/{p}", p)

    def test_case_ignored_and_query_kept(self):
        self.assertEqual(jellyfin.target_url(B + "/", "items", "ParentId=1"), B + "/items?ParentId=1")

    def test_other_paths_refused(self):
        for p in ["", "web/index.html", "System/Info", "Library/Refresh", "Startup/User", "Auth/Keys"]:
            self.assertIsNone(jellyfin.target_url(B, p), p)

    def test_writes_only_for_reports(self):
        self.assertEqual(jellyfin.target_url(B, "Sessions/Playing", method="POST"), B + "/Sessions/Playing")
        self.assertEqual(jellyfin.target_url(B, "Sessions/Playing/Stopped", method="POST"), B + "/Sessions/Playing/Stopped")
        self.assertEqual(jellyfin.target_url(B, "UserPlayedItems/s1", method="POST"), B + "/UserPlayedItems/s1")
        for p in ["Items/abc", "Users/u1/Policy", "Playlists/p1/Items"]:
            self.assertIsNone(jellyfin.target_url(B, p, method="POST"), p)
        self.assertIsNone(jellyfin.target_url(B, "Items/abc", method="DELETE"))

    def test_dotdot_refused(self):
        for p in ["Items/../System/Info", "Audio/%2e%2e/x", "Items/a/..", "Users/..%2fAuth"]:
            self.assertIsNone(jellyfin.target_url(B, p), p)

    def test_no_base(self):
        self.assertIsNone(jellyfin.target_url("", "Items"))


class Headers(unittest.TestCase):
    def test_key_added_and_cookies_dropped(self):
        h = jellyfin.request_headers({"range": "bytes=0-", "Cookie": "x", "Authorization": "theirs"}, "k1")
        self.assertEqual(h["Range"], "bytes=0-")
        self.assertNotIn("Cookie", h)
        self.assertIn('Token="k1"', h["Authorization"])


class PickUser(unittest.TestCase):
    USERS = [
        {"Id": "1", "Name": "Gäst", "Policy": {"IsAdministrator": False}},
        {"Id": "2", "Name": "Viktor", "Policy": {"IsAdministrator": True}},
        {"Id": "3", "Name": "Gammal", "Policy": {"IsAdministrator": True, "IsDisabled": True}},
    ]

    def test_named(self):
        self.assertEqual(jellyfin.pick_user(self.USERS, "gäst")["Id"], "1")

    def test_first_admin(self):
        self.assertEqual(jellyfin.pick_user(self.USERS, "")["Id"], "2")

    def test_unknown_or_disabled(self):
        self.assertIsNone(jellyfin.pick_user(self.USERS, "nobody"))
        self.assertIsNone(jellyfin.pick_user(self.USERS, "Gammal"))


if __name__ == "__main__":
    unittest.main()
