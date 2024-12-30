# launchpad-microtuning-bitwig
Novation Launchpad X Controller script to play 19EDO

# Load the scripts

1. Copy the `launchpad-microtuning.control.js` file into the `Controller Scripts` in your `Bitwig Studio` folder (or where you configured it).
2. Open `Bitwig` and add the controller.

# Todo

- [X] Connect to device
- [X] press pad sends midi note on
- [X] release pad sends midi note off
- [X] aftertouch
- [ ] scrolling changes octaves (need to remap pads to new midi notes)
- [X] Map pads to chromatic scale (C root note, left->right, bottom->up)
- [X] More ergonomic layout (for 5 fingers)
- [X] Control lights
- [X] Map lights to octaves and other meaningful notes
- [ ] Queue for notes when playing same note with multiple pads
- [ ] Other maps? Other root?
- [ ] Other scales?
