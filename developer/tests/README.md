# Rules checks

`cr-rules.js` plays a mock game in a headless browser and checks the behaviour the app has built against the Comprehensive Rules
(edition of 19 June 2026). Every test names the rule number it checks, so a failure points at the rule.

    pip/npm: playwright must be installed (npm i playwright)
    cd tests
    python3 inject.py        # copies the app into tests/pt and exposes a few functions for the tests
    node cr-rules.js

`corpus.json` is a small mock card list (not real Scryfall data). Add cards there and to the deck list in `common.js` to test more rules.
A passing test only means the app agrees with the reading of the rule written in the test; rule numbers move between editions, so check
the number against the current Comprehensive Rules before relying on it.


Note: `corpus.json` (mock cards for the tests) contains real card text. It is git-ignored and left out of the published packages. Recreate it locally from Scryfall data if you need to run the tests.
