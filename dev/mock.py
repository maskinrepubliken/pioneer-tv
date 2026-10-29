"""Stand-ins for Jellyfin, RomM and the daemon's API, for dev/preview.py.

With them every page can be drawn without a server or a Pi: the catalogue
(dev/katalog.html) shows each view and each of its states from this data.
Pictures are drawn here as SVG (a colour from the name, the name on it);
songs are a few seconds of silence. A page opened with ?mockerror=no_key,
auth or down gets that error from every call it makes (read from the
Referer), so the error views can be shown too. Stdlib only.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import struct
import wave
from html import escape
from urllib.parse import parse_qs, urlparse

T = 10_000_000
LOREM = ("En berättelse om några människor som möter något de inte väntat sig, "
         "i en stad vid havet, under en lång och mörk vinter.")

# ------------------------------------------------------------ pictures


def colour(name: str) -> str:
    h = int(hashlib.md5(name.encode()).hexdigest()[:6], 16)
    hues = ["#7b5ea7", "#1f7a4d", "#b8940c", "#a8352a", "#335577", "#5b4636", "#2e6b6b", "#8a4f7d"]
    return hues[h % len(hues)]


def picture(name: str, w: int, h: int) -> bytes:
    words, lines, line = name.split(), [], ""
    for word in words:
        if len(line) + len(word) > 14 and line:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    lines.append(line)
    size = max(14, min(w, h) // 9)
    texts = "".join(f'<text x="{w // 2}" y="{h // 2 + (i - len(lines) / 2 + 0.8) * size * 1.2:.0f}" '
                    f'font-family="Georgia, serif" font-size="{size}" fill="#f4efe4" text-anchor="middle">{escape(t)}</text>'
                    for i, t in enumerate(lines[:4]))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="{colour(name)}"/>{texts}</svg>').encode()


def silence(seconds: float = 8) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"\0\0" * int(8000 * seconds))
    return out.getvalue()


# ------------------------------------------------------------ Jellyfin


def _ud(pos_min=0, played=False, runtime_min=1):
    return {"PlaybackPositionTicks": pos_min * 60 * T, "Played": played,
            "PlayedPercentage": 100 * pos_min / runtime_min if pos_min else 0}


def _source(i, subs=True):
    streams = [{"Index": 0, "Type": "Video", "Codec": "hevc"},
               {"Index": 1, "Type": "Audio", "Codec": "aac", "Language": "eng", "DisplayTitle": "Engelska · AAC 5.1"},
               {"Index": 2, "Type": "Audio", "Codec": "ac3", "Language": "swe", "DisplayTitle": "Svenska · AC3 stereo"}]
    if subs:
        streams += [{"Index": 3, "Type": "Subtitle", "Codec": "subrip", "Language": "swe", "DisplayTitle": "Svenska"},
                    {"Index": 4, "Type": "Subtitle", "Codec": "subrip", "Language": "eng", "DisplayTitle": "Engelska", "IsExternal": True}]
    return [{"Id": i, "DefaultAudioStreamIndex": 1, "DefaultSubtitleStreamIndex": -1, "MediaStreams": streams}]


# Some under their English name as well as their Swedish (Comedy, Komedi),
# as Jellyfin's are: the pages show them as one.
MOVIE_GENRES = [["Drama", "Comedy"], ["Komedi"], ["Thriller", "Kriminal"], ["Science Fiction"], ["Dokumentär"],
                ["Familj", "Animerat"], ["Drama", "Romantik"], ["Äventyr", "Fantasy"], ["Skräck"], ["Västern"], ["Krig", "Historisk"], ["Action"]]


def _movie(n, name, year, mins, pos=0, played=False):
    i = f"film{n}"
    # Every third without a picture of its own: the case's mockup instead.
    return {"Id": i, "Name": name, "Type": "Movie", "ProductionYear": year, "RunTimeTicks": mins * 60 * T,
            "Overview": LOREM + " " + LOREM, "Genres": MOVIE_GENRES[(n - 1) % len(MOVIE_GENRES)],
            "GenreItems": [{"Name": g, "Id": f"g-{g}"} for g in MOVIE_GENRES[(n - 1) % len(MOVIE_GENRES)]],
            "ImageTags": {"Primary": "p"} if n % 3 else {},
            "BackdropImageTags": ["b"] if n % 3 else [], "UserData": _ud(pos, played, mins), "MediaSources": _source(i)}


MOVIES = [_movie(1, "Fyren", 2019, 112, pos=42), _movie(2, "Sommarnatt", 2021, 95), _movie(3, "Den långa vägen hem", 2004, 131, played=True),
          _movie(4, "Kaffe och cigaretter", 2003, 96), _movie(5, "Isbrytaren", 2016, 104), _movie(6, "Ett år", 2010, 88),
          _movie(7, "Vinterljus", 1963, 81), _movie(8, "Skärgårdsnätter", 1999, 102), _movie(9, "Den sista sommaren", 2015, 118),
          _movie(10, "Stationen", 2008, 90), _movie(11, "Brev från Berlin", 1987, 99), _movie(12, "Fjällen", 2022, 107)]
SERIES = [{"Id": "serie1", "Name": "Skärgårdsdoktorn", "Type": "Series", "IsFolder": True, "ProductionYear": 1997, "ChildCount": 2,
           "Overview": LOREM, "Genres": ["Drama"], "GenreItems": [{"Name": "Drama", "Id": "g-Drama"}], "ImageTags": {"Primary": "p"}, "UserData": {}},
          {"Id": "serie2", "Name": "Hammarkullen", "Type": "Series", "IsFolder": True, "ProductionYear": 1997, "ChildCount": 1,
           "Overview": LOREM, "Genres": ["Drama", "Komedi"], "GenreItems": [{"Name": "Drama", "Id": "g-Drama"}, {"Name": "Komedi", "Id": "g-Komedi"}],
           "ImageTags": {}, "UserData": {}}]
SEASONS = {s["Id"]: [{"Id": f"{s['Id']}-s{n}", "Name": f"Säsong {n}", "Type": "Season", "IsFolder": True, "SeriesId": s["Id"],
                      "IndexNumber": n, "ImageTags": {"Primary": "p"}, "UserData": {"PlayedPercentage": 40 if n == 1 else 0}}
                     for n in range(1, s["ChildCount"] + 1)] for s in SERIES}


def _episode(series, s, n, played=False, pos=0):
    i = f"{series['Id']}-s{s}e{n}"
    return {"Id": i, "Name": f"Avsnitt {n}", "Type": "Episode", "SeriesName": series["Name"], "SeriesId": series["Id"],
            "SeasonId": f"{series['Id']}-s{s}", "ParentIndexNumber": s, "IndexNumber": n, "RunTimeTicks": 44 * 60 * T,
            "Overview": LOREM, "ImageTags": {"Primary": "p"} if n % 4 else {}, "UserData": _ud(pos, played, 44), "MediaSources": _source(i)}


EPISODES = {}
for _s in SERIES:
    for _season in SEASONS[_s["Id"]]:
        n = _season["IndexNumber"]
        EPISODES[_season["Id"]] = [_episode(_s, n, e, played=n == 1 and e < 3, pos=12 if n == 1 and e == 3 else 0) for e in range(1, 9)]
CLIPS = [{"Id": f"klipp{n}", "Name": f"Midsommar {2015 + n}", "Type": "Video", "RunTimeTicks": (3 + n) * 60 * T,
          "ImageTags": {"Primary": "p"} if n % 2 else {}, "UserData": {}, "MediaSources": _source(f"klipp{n}", subs=False)} for n in range(1, 7)]
FOLDER = {"Id": "mapp1", "Name": "Resor", "Type": "Folder", "IsFolder": True, "ChildCount": 3, "UserData": {}}
BOXSETS = [{"Id": "samling1", "Name": "Bergman", "Type": "BoxSet", "IsFolder": True, "ChildCount": 3, "ImageTags": {"Primary": "p"}, "UserData": {}},
           {"Id": "samling2", "Name": "Sommarfilmer", "Type": "BoxSet", "IsFolder": True, "ChildCount": 2, "ImageTags": {}, "UserData": {}}]
CHANNELS = [{"Id": f"kanal{n}", "Name": name, "Type": "Folder", "IsFolder": True, "ChildCount": 3 + n, "UserData": {}}
            for n, name in enumerate(["Every Frame a Painting", "Alt Shift X", "Design Theory", "Dunderpatrullen", "exurb1a"], 1)]

ARTISTS = [{"Id": f"artist{n}", "Name": name, "Type": "MusicArtist", "ImageTags": {"Primary": "p"} if n % 3 else {}}
           for n, name in enumerate(["Anna Ternheim", "Kent", "Lars Winnerbäck", "Robyn", "Säkert!", "The Knife",
                                     "Veronica Maggio", "Thåström", "Ane Brun", "First Aid Kit"], 1)]
ALBUMS = [{"Id": f"album{n}", "Name": name, "Type": "MusicAlbum", "AlbumArtist": ARTISTS[(n - 1) % len(ARTISTS)]["Name"],
           "AlbumArtists": [{"Name": ARTISTS[(n - 1) % len(ARTISTS)]["Name"], "Id": ARTISTS[(n - 1) % len(ARTISTS)]["Id"]}],
           "ProductionYear": 1995 + n, "ChildCount": 10, "ImageTags": {"Primary": "p"} if n % 4 != 3 else {}}
          for n, name in enumerate(["Somebody Outside", "Isola", "Daugava", "Body Talk", "Säkert!", "Silent Shout",
                                    "Satan i gatan", "Skebokvarnsv. 209", "Spending Time with Morgan", "The Lion's Roar",
                                    "Separation Sunday", "Vapen & ammunition", "Kom", "Honey", "Fjärilar i magen",
                                    "Heartbeats", "Den första är gratis", "Fan of Lorem", "Ipsum", "Dolor"], 1)]


def _song(album, n):
    return {"Id": f"{album['Id']}-l{n}", "Name": f"Låt nummer {n}", "Type": "Audio", "Album": album["Name"], "AlbumId": album["Id"],
            "AlbumPrimaryImageTag": album["ImageTags"].get("Primary"), "Artists": [album["AlbumArtist"]], "AlbumArtist": album["AlbumArtist"],
            "RunTimeTicks": (180 + n * 7) * T, "IndexNumber": n, "ImageTags": {},
            "MediaSources": [{"Container": "wav", "MediaStreams": [{"Type": "Audio", "Codec": "pcm_s16le"}]}]}


SONGS = {a["Id"]: [_song(a, n) for n in range(1, 11)] for a in ALBUMS}
PLAYLISTS = [{"Id": f"lista{n}", "Name": name, "Type": "Playlist", "ChildCount": 12, "ImageTags": {"Primary": "p"} if n != 4 else {}}
             for n, name in enumerate(["Söndagsmorgon", "Middag", "Träning", "Bilresan", "Julmusik"], 1)]
VIEWS = [{"Id": "lib-film", "Name": "Filmer", "CollectionType": "movies"}, {"Id": "lib-serier", "Name": "Serier", "CollectionType": "tvshows"},
         {"Id": "lib-musik", "Name": "Musik", "CollectionType": "music"}, {"Id": "lib-hem", "Name": "Hemvideor", "CollectionType": "homevideos"}]
ALL = {x["Id"]: x for x in MOVIES + SERIES + sum(SEASONS.values(), []) + sum(EPISODES.values(), []) + CLIPS + [FOLDER] + CHANNELS + BOXSETS
       + ARTISTS + ALBUMS + sum(SONGS.values(), []) + PLAYLISTS}


def _items(q: dict) -> list:
    parent, types = q.get("parentid"), (q.get("includeitemtypes") or "").split(",")
    term = (q.get("searchterm") or "").lower()
    if term:
        pool = [x for x in ALL.values() if term in x["Name"].lower() and (not types[0] or x["Type"] in types)]
        return pool[: int(q.get("limit") or 60)]
    if parent:
        if parent in SONGS:
            return SONGS[parent]
        pool = {"lib-film": MOVIES, "lib-serier": SERIES, "lib-hem": [FOLDER] + CHANNELS + CLIPS[:3], "mapp1": CLIPS[3:],
                "samling1": MOVIES[6:9], "samling2": MOVIES[1:3],
                **{c["Id"]: CLIPS[(i % 3):(i % 3) + 3 + i % 2] for i, c in enumerate(CHANNELS)}}.get(parent, [])
        genres = q.get("genreids")
        if genres:
            wanted = set(genres.split(","))
            pool = [x for x in pool if wanted & {g["Id"] for g in x.get("GenreItems", [])}]
        return pool
    if "BoxSet" in types:
        return BOXSETS
    if "MusicAlbum" in types:
        artist = q.get("albumartistids")
        return [a for a in ALBUMS if not artist or a["AlbumArtists"][0]["Id"] == artist]
    if "Playlist" in types:
        return PLAYLISTS
    if "Audio" in types:
        artist = q.get("artistids")
        songs = sum(SONGS.values(), [])
        return [s for s in songs if not artist or s["AlbumArtist"] == ALL[artist]["Name"]][:300]
    return []


def jellyfin(path: str, query: str, method: str) -> tuple[int, str, bytes]:
    p, q = path.lower(), {k.lower(): v[0] for k, v in parse_qs(query).items()}
    js = lambda d, status=200: (status, "application/json", json.dumps(d).encode())
    if method == "POST":
        return 204, "text/plain", b""
    m = re.match(r"items/([^/]+)/images/(\w+)", p)
    if m:
        item = ALL.get(path.split("/")[1], {"Name": "?"})
        wide = m.group(2) in ("backdrop", "thumb") or item.get("Type") in ("Episode", "Video")
        square = item.get("Type") in ("MusicAlbum", "MusicArtist", "Playlist", "Audio")
        w, h = (480, 270) if wide else (300, 300) if square else (280, 420)
        return 200, "image/svg+xml", picture(item["Name"], w, h)
    m = re.match(r"audio/([^/]+)/", p)
    if m:
        return 200, "audio/wav", silence()
    if p == "userviews":
        return js({"Items": VIEWS})
    if p == "genres":
        pool = {"lib-film": MOVIES, "lib-serier": SERIES}.get(q.get("parentid"), MOVIES + SERIES)
        names = sorted({g for x in pool for g in x.get("Genres", [])})
        return js({"Items": [{"Id": f"g-{g}", "Name": g} for g in names], "TotalRecordCount": len(names)})
    if p == "items/latest":
        return js({"lib-film": list(reversed(MOVIES))[:8], "lib-serier": SERIES, "lib-hem": CLIPS}.get(q.get("parentid"), []))
    if p == "movies/recommendations":
        return js([{"RecommendationType": "SimilarToRecentlyPlayed", "BaselineItemName": MOVIES[0]["Name"], "Items": MOVIES[3:9]},
                   {"RecommendationType": "HasActorFromRecentlyPlayed", "BaselineItemName": "Stellan Skarsgård", "Items": MOVIES[8:11]}])
    if p == "shows/nextup":
        return js({"Items": [EPISODES["serie1-s1"][3], EPISODES["serie2-s1"][0]]})
    if p == "useritems/resume":
        lib = q.get("parentid")
        return js({"Items": [MOVIES[0]] if lib == "lib-film" else [EPISODES["serie1-s1"][2]] if lib == "lib-serier" else []})
    m = re.match(r"items/([^/]+)$", p)
    if m:
        item = ALL.get(path.split("/")[1])
        return js(item) if item else js({}, 404)
    if p == "items":
        found = _items(q)
        if q.get("sortby") == "Random":
            found = list(reversed(found))
        return js({"Items": found, "TotalRecordCount": len(found)})
    m = re.match(r"playlists/([^/]+)/items", p)
    if m:
        return js({"Items": sum(list(SONGS.values())[:2], [])[:12]})
    if p.startswith("artists"):
        term = (q.get("searchterm") or "").lower()
        return js({"Items": [a for a in ARTISTS if term in a["Name"].lower()]})
    m = re.match(r"shows/([^/]+)/seasons", p)
    if m:
        return js({"Items": SEASONS.get(path.split("/")[1], [])})
    m = re.match(r"shows/([^/]+)/episodes", p)
    if m:
        return js({"Items": EPISODES.get(q.get("seasonid"), [])})
    return js({"error": path}, 404)


# ------------------------------------------------------------ RomM

PLATFORMS = [{"id": 1, "slug": "snes", "name": "Super Nintendo", "display_name": "Super Nintendo"},
             {"id": 2, "slug": "n64", "name": "Nintendo 64", "display_name": "Nintendo 64"},
             {"id": 3, "slug": "genesis", "name": "Sega Mega Drive", "display_name": "Mega Drive"},
             {"id": 4, "slug": "nes", "name": "NES", "display_name": "NES"},
             {"id": 5, "slug": "dos", "name": "DOS", "display_name": "DOS"},
             {"id": 6, "slug": "gba", "name": "Game Boy Advance", "display_name": "Game Boy Advance"},
             {"id": 7, "slug": "psx", "name": "PlayStation", "display_name": "PlayStation"},
             {"id": 8, "slug": "arcade", "name": "Arcade", "display_name": "Arcade"}]
GAME_NAMES = {1: ["Super Mario World", "Tetris & Dr. Mario", "The Legend of Zelda: A Link to the Past", "Donkey Kong Country",
                  "Super Metroid", "F-Zero", "Chrono Trigger", "Secret of Mana", "Kirby's Dream Land 3", "Star Fox"],
              2: ["GoldenEye 007", "Super Mario 64", "Mario Kart 64", "Banjo-Kazooie", "Wave Race 64"],
              3: ["Sonic the Hedgehog", "Streets of Rage 2", "Valis III", "Gunstar Heroes"],
              4: ["Super Mario Bros.", "Contra", "Mega Man 2"],
              5: ["Commander Keen", "Prince of Persia", "The Secret of Monkey Island"],
              6: ["Advance Wars", "Golden Sun"],
              7: ["Final Fantasy VII", "Crash Bandicoot"],
              8: ["Street Fighter II", "Metal Slug"]}
ROMS = []
for _pid, _names in GAME_NAMES.items():
    for _k, _n in enumerate(_names):
        _id = _pid * 100 + _k
        ROMS.append({"id": _id, "name": _n, "name_sort_key": _n.lower(), "fs_name": f"{_n}.zip",
                     "platform_id": _pid, "platform_slug": next(p["slug"] for p in PLATFORMS if p["id"] == _pid),
                     # The third of a console's, and every one of the last three's, without
                     # a cover: the console's mockup instead (shared/mockups.js).
                     **({"path_cover_small": None, "path_cover_large": None} if _k % 3 == 2 or _pid >= 6 else
                        {"path_cover_small": f"/assets/cover/{_id}.svg", "path_cover_large": f"/assets/cover/{_id}.svg"}),
                     "summary": LOREM, "metadatum": {"first_release_date": f"{1990 + _k}-06-01", "player_count": "1-2",
                                                      "game_modes": ["Single player", "Multiplayer"] if _k % 2 else ["Single player"],
                                                      "publishers": ["Nintendo"]},
                     "rom_user": {"last_played": f"2026-10-{20 + _k % 7}T18:00:00Z"} if _k < 2 else {}, "files": [{}]})
COLLECTIONS = [{"id": 1, "name": "Favoriter", "is_favorite": True, "rom_ids": [100, 101, 200]}, {"id": 2, "name": "Två spelare", "rom_ids": [102, 300, 301, 103, 302, 401, 500, 104]}]
VIRTUAL = [{"id": "plattformsspel", "name": "Plattformsspel", "rom_ids": [100, 201, 300, 303, 400, 105]}]


def romm(path: str, query: str, method: str) -> tuple[int, str, bytes]:
    q = {k: v[0] for k, v in parse_qs(query).items()}
    js = lambda d, status=200: (status, "application/json", json.dumps(d).encode())
    m = re.match(r"assets/cover/(\d+)\.svg", path)
    if m:
        rom = next((r for r in ROMS if r["id"] == int(m.group(1))), {"name": "?"})
        return 200, "image/svg+xml", picture(rom["name"], 300, 400)
    if method in ("PUT", "POST"):
        return js({})
    if path == "api/platforms":
        return js([{**p, "rom_count": sum(r["platform_id"] == p["id"] for r in ROMS)} for p in PLATFORMS])
    if path == "api/collections":
        return js(COLLECTIONS)
    if path == "api/collections/virtual":
        return js(VIRTUAL)
    if path in ("api/states", "api/saves"):
        return js([])
    m = re.match(r"api/roms/(\d+)$", path)
    if m:
        rom = next((r for r in ROMS if r["id"] == int(m.group(1))), None)
        return js(rom) if rom else js({}, 404)
    if path == "api/roms":
        found = ROMS
        if q.get("platform_ids"):
            found = [r for r in found if r["platform_id"] == int(q["platform_ids"])]
        if q.get("collection_id"):
            ids = next(c["rom_ids"] for c in COLLECTIONS if str(c["id"]) == q["collection_id"])
            found = [r for r in found if r["id"] in ids]
        if q.get("virtual_collection_id"):
            ids = next(c["rom_ids"] for c in VIRTUAL if c["id"] == q["virtual_collection_id"])
            found = [r for r in found if r["id"] in ids]
        if q.get("search_term"):
            found = [r for r in found if q["search_term"].lower() in r["name"].lower()]
        if q.get("last_played"):
            found = [r for r in found if r["rom_user"]]
        found = sorted(found, key=lambda r: r["name_sort_key"])
        letters = {}
        for i, r in enumerate(found):
            letters.setdefault(r["name_sort_key"][0], i)
        return js({"items": found, "char_index": letters})
    return js({"error": path}, 404)


# ------------------------------------------------------------ the daemon


def daemon(path: str, query: str, method: str) -> tuple[int, str, bytes] | None:
    js = lambda d, status=200: (status, "application/json", json.dumps(d).encode())
    if path == "/api/jellyfin":
        return js({"ok": True, "user_id": "u1", "user": "viktor"})
    if path == "/api/games":
        return js({"platforms": ["snes", "n64", "genesis", "nes", "dos"], "state": "idle", "game": None,
                   "point": None, "players": ["Rosa handkontroll", "Grön handkontroll"]})
    if path.startswith("/api/games/"):
        return js({"ok": True, "message": ""})
    if path == "/api/finds":
        games = [{"title": r["name"], "kind": "spel", "url": "/romm" + r["path_cover_large"], "kept": True} for r in ROMS if r["path_cover_large"]]
        films = [{"title": m["Name"], "kind": "film", "url": f"/jellyfin/Items/{m['Id']}/Images/Primary?tag=p", "kept": False}
                 for m in MOVIES if m["ImageTags"]]
        albums = [{"title": a["Name"], "kind": "album", "url": f"/jellyfin/Items/{a['Id']}/Images/Primary?tag=p", "kept": False}
                  for a in ALBUMS if a["ImageTags"]]
        return js({"finds": games + films + albums})
    if path == "/api/video":
        return js({"state": "idle", "item": None, "choice": {}})
    if path.startswith("/api/video/"):
        return js({"ok": True, "message": ""})
    return None


def error_for(referer: str | None) -> tuple[int, str, bytes] | None:
    """The error a page opened with ?mockerror=... asked for."""
    if not referer:
        return None
    kind = (parse_qs(urlparse(referer).query).get("mockerror") or [""])[0]
    if kind == "no_key":
        return 503, "application/json", b'{"error": "no_key"}'
    if kind == "auth":
        return 401, "application/json", b"{}"
    if kind == "down":
        return 502, "application/json", b'{"error": "unreachable"}'
    return None
