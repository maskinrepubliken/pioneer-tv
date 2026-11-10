"""schedule.py: SVT Play's channel page read for now and next.
`python -m unittest tests.test_schedule` from daemon/."""
import json
import unittest
from datetime import datetime

from pioneertv import schedule

T = lambda hm: f"2026-11-10T{hm}:00+01:00"   # noqa: E731
SVT1 = [
    {"name": "Morgonstudion", "start": T("06:00"), "startTime": "06:00"},
    {"name": "Paus", "start": T("09:00"), "startTime": "09:00", "isBroadcastIntermission": True},
    {"name": "Hemmagympa", "start": T("10:00"), "startTime": "10:00"},
    {"name": "Rapport", "start": T("12:00"), "startTime": "12:00"},
]


def page(channels):
    """The page as SVT Play writes it: the data client's state, a JSON string in JSON."""
    state = json.dumps({"channels": {"channels": channels}})
    return '<script>{"1":{"hasNext":false,"data":' + json.dumps(state) + '}}</script>'


class Schedule(unittest.TestCase):
    def test_the_page_read(self):
        found = schedule.channels(page([{"id": "ch-svt1", "name": "SVT 1", "schedule": SVT1}]))
        self.assertEqual(list(found), ["ch-svt1"])
        self.assertEqual(found["ch-svt1"][0]["name"], "Morgonstudion")

    def test_now_and_next(self):
        at = datetime.fromisoformat(T("11:00")).timestamp()
        got = schedule.now_and_next(SVT1, at)
        self.assertEqual(got["now"]["name"], "Hemmagympa")
        self.assertEqual(got["now"]["end"], "12:00")
        self.assertEqual(got["now"]["progress"], 0.5)
        self.assertEqual(got["next"], {"name": "Rapport", "start": "12:00"})

    def test_before_the_first_only_next(self):
        at = datetime.fromisoformat(T("05:00")).timestamp()
        self.assertEqual(schedule.now_and_next(SVT1, at), {"next": {"name": "Morgonstudion", "start": "06:00"}})

    def test_a_tiles_address(self):
        self.assertEqual(schedule.slug("https://www.svtplay.se/kanaler/svtbarn?start=auto"), "svtbarn")
        self.assertIsNone(schedule.slug("https://www.svtplay.se/"))


if __name__ == "__main__":
    unittest.main()
