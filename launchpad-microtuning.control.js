loadAPI(19)

host.defineController("Novation", "Launchpad X", "0.1", "c6a1c708-6e8f-4d81-8eeb-3620579de815", "gahel")
host.addDeviceNameBasedDiscoveryPair(["Launchpad X"], ["Launchpad X"])
host.defineMidiPorts(1, 1)

/* ------------------------------------------------------ */
/*                    DEBUGGING FEATURE                   */
/* ------------------------------------------------------ */
var DEBUG = true

function debug(bool = false) {
    DEBUG = bool
    return
}

/* ------------------------------------------------------ */
/*                         LOGGING                        */
/* ------------------------------------------------------ */
function log(msg) {
    if (DEBUG) { println(msg) }
}

/* ------------------------------------------------------ */
/*                       MIDI SPECS                       */
/* ------------------------------------------------------ */
const ON = 127
const OFF = 0

const NOTE_ON = 144
const NOTE_OFF = 128
const CC = 176
const AFTERTOUCH = 160


/* ------------------------------------------------------ */
/*                        HARDWARE                        */
/* ------------------------------------------------------ */
const SYSEX_HEADER = "F0 00 20 29 02 0C";
const SYSEX_FOOTER = "F7";

function sysex(msg) {
    log(SYSEX_HEADER + ` ${msg} ` + SYSEX_FOOTER);
    midiOut.sendSysex(SYSEX_HEADER + ` ${msg} ` + SYSEX_FOOTER);
}

const Mode = {
    LIVE: 0,
    PROGRAMMER: 1,
};

function setMode(mode) {
    const modeHex = mode == 0 ? "00" : "01";
    midiOut.sendSysex(SYSEX_HEADER + ` 0E ${modeHex} F7`);
}

/* ------------------- PADS / BUTTONS  ------------------ */

/// 1 <= row, column <= 9
class PadIndex {
    /// Class fields are not compatible with bitwig

    // row;    -> from bottom
    // col;    -> from left
    // midiId;

    static fromIndex(row,col) {
        const padIndex = new PadIndex();
        padIndex.row = row;
        padIndex.col = col;
        padIndex.midiId = row*10 + col;
        return padIndex;
    }

    static fromID(midiId) {
        const padIndex = new PadIndex();
        padIndex.midiId = midiId;
        padIndex.col = midiId % 10;
        padIndex.row = Math.floor( (midiId-padIndex.col)/10 ); // use floor to convert back to int
        return padIndex;
    }
}


/* ----------------------- PALETTE ----------------------- */
// based on the builtin color palette specified by doc (page 12)
const Palette = {
    OFF: 0,
    GREY: 1,
    WHITE: 3,
    RED: 5,
    ORANGE: 9,
    GREEN: 21,
    PALE_GREEN: 17,
    BLUE: 37,
    PURPLE: 45,
    PINK: 53,
    LAVANDER: 49,
    DARK_YELLOW: 14,
    MAGENTA: 57,
    DARK_BLUE: 43,
    DARK_GREEN: 19,
};

// const Intensity = {
//     LOWEST: 0,
//     LOW: 3,
//     MID: 2,
//     HIGH: 1,    
// };

// paletteIndex(color, instensity) {
//     return color + intensity;
// };


/* ------------------------- LED ------------------------ */

/// channel on which the message should be sent
const LightingType = {
    STATIC: 1,
    FLASHING: 2,
    PULSING: 3,
    RGB: 4,
}

function setLED(padIndex, color, lightingType=LightingType.STATIC) {
    midiOut.sendMidi(noteOnChannel(lightingType), padIndex.midiId, color);
}

function resetLEDS() {
    for (let i = 1; i <= 8; i++) {
        for (let j = 1; j <= 8; j++) {
            let padIndex = PadIndex.fromIndex(i,j);
            setLED(padIndex, edo19.color(padIndex));
        }
    }
}


/* ------------------------------------------------------ */
/*                         HELPERS                        */
/* ------------------------------------------------------ */
function toggleValue(value) {
    return value === 0 ? 127 : 0
}

function toggle(val) {
    return val === 127 ? 0 : 127
}

function toBool(val) {
    return val === 127 ? true : false
}

function toMidi(bool) {
    return bool === true ? 127 : 0
}

function handleError(error) {
    println(`${error.name}: ${error.message}`)
    return
}

function getTime() {
    const d = new Date();
    return d.getTime();
}

/// 1 <= chan <= 16
function noteOnChannel(chan) {
    return NOTE_ON + chan - 1;
}

function isPolyPressure(status) {
    return (status >= 160 && status <= 175);
}

function isControlChange(status) {
    return (status >= 176 && status <= 191);
}


/* ------------------------------------------------------ */
/*                     INIT CONTROLLER                    */
/* ------------------------------------------------------ */
function init() {
    // sending to host (bitwig)
    midiIn = host.getMidiInPort(0)
    midiIn.setMidiCallback(onMidi)
    noteInput = midiIn.createNoteInput("Launchpad");
    noteInput.setShouldConsumeEvents(false);
    noteInput.setKeyTranslationTable(edo19.getMap()); // filter all notes

    // sending to controller (launchpad) -> LED
    midiOut = host.getMidiOutPort(0)

    // Cursor track
    cursorTrack = host.createCursorTrack("CURSOR_TRACK", "Cursor Track", 0, 0, true);

    // manual handling of the Launchpad
    setMode(Mode.PROGRAMMER);
    resetLEDS();
}

function exit() {
    setMode(Mode.LIVE);
    log("exit()")
}

/* ------------------------------------------------------ */
/*                   MIDI STATUS HANDLER                  */
/* ------------------------------------------------------ */

class Mapping {
    constructor() {
        this.divisions = 19;
        this.rootKey = 60; // reference key to match micropitch C3
        this.lowNote = this.rootKey - 19 * 1;
        this.rootNote = 0;
        this.midiMap = this.getMap();
    }

    // from left->right and then bot->top
    index(padIndex) {
        return 8*(padIndex.row-1) + (padIndex.col-1);
    }

    midi(padIndex) {
        return this.lowNote + this.index(padIndex);
    }

    getMap() {
        let m = Array(128).fill().map(() => -1); // initialize to -1 to filter all unspecified values
        for (let i = 1; i <= 8; i++) {
            for (let j = 1; j <= 8; j++) {
                let padIndex = PadIndex.fromIndex(i,j);
                // log(`row: ${padIndex.row}, col: ${padIndex.col}, index: ${this.index(padIndex)}`);
                m[padIndex.midiId] = this.midi(padIndex);
            }
        }
        return m;
    }

    color(padIndex) {
        let offset = Math.ceil(127/this.divisions) * 19; // make sure nect line modulo is alway for positive integer
        let degree = (this.midi(padIndex) - this.rootKey + offset) % this.divisions + 1;
        switch (degree) {
            case 1:  return Palette.RED;

            case 4:  return Palette.GREY;

            case 7:  return Palette.BLUE;

            case 9:  return 61;

            case 12: return Palette.MAGENTA;

            case 15: return Palette.DARK_BLUE;

            case 18: return Palette.GREY;

            default: return Palette.OFF;
        }
        // switch (degree) {
        //     case 1:  return Palette.RED;
        //     case 2:  return Palette.DARK_YELLOW;
        //     case 3:  return Palette.DARK_BLUE;
        //
        //     case 4:  return Palette.WHITE;
        //     case 5:  return Palette.DARK_YELLOW;
        //     case 6:  return Palette.DARK_BLUE;
        //
        //     case 7:  return Palette.PINK;
        //     case 8:  return Palette.DARK_GREEN;
        //
        //     case 9:  return Palette.PURPLE;
        //     case 10: return Palette.DARK_YELLOW;
        //     case 11: return Palette.DARK_BLUE;
        //
        //     case 12: return Palette.ORANGE;
        //     case 13: return Palette.DARK_YELLOW;
        //     case 14: return Palette.DARK_BLUE;
        //
        //     case 15: return Palette.LAVANDER;
        //     case 16: return Palette.DARK_YELLOW;
        //     case 17: return Palette.DARK_BLUE;
        //
        //     case 18: return Palette.WHITE;
        //     case 19: return Palette.DARK_GREEN;
        //
        //     default: return Palette.OFF;
        // }
    }
}

const edo19 = new Mapping();
log(edo19.getMap().toString());


/* ----------------------- NOTE ON ---------------------- */
function handleNoteOn(cc, value) {
    try {
        log(`handleNoteOn -> ${cc} : ${value}`)

        padIndex = PadIndex.fromID(cc);
        log(`row: ${padIndex.row}, col: ${padIndex.col}`);
        setLED(padIndex, Palette.GREEN);
        return
    } catch (error) {
        handleError(error)
    }
}

/* ---------------------- NOTE OFF ---------------------- */
function handleNoteOff(cc, value) {
    try {
        log(`handleNoteOff -> ${cc} : ${value}`)

        padIndex = PadIndex.fromID(cc);
        setLED(padIndex, edo19.color(padIndex));
        return
    } catch (error) {
        handleError(error)
    }
}

/* --------------------- AFTERTOUCH --------------------- */
function handleAftertouch(cc, value) {
    try {
        // log(`handleAftertouch -> ${cc} : ${value}`)
        return
    } catch (error) {
        handleError(error)
    }
}

/* ----------------------- BUTTONS ---------------------- */
function isButton(cc, value) {
    const ccString = `${cc}`;
    if (ccString.length !== 2) handleError(`CC ${cc} is not a correct button/pad index`);
    return ccString[0] === '9' || ccString[1] === '9'; // top row or right most col
}

function handleButton(index, value) {
    log(`handleButton -> ${index}: ${value}`);
}

/* ------------------------------------------------------ */
/*                   MIDI INPUT HANDLER                   */
/* ------------------------------------------------------ */
function onMidi(status, cc, value) {
    switch (true) {
        case isNoteOn(status):
            if (value === 0) handleNoteOff(cc, value);
            else handleNoteOn(cc, value);
            break;

        case isNoteOff(status):
            handleNoteOff(cc, value);
            break;

        case isControlChange(status):
            if (isButton(cc, value)) handleButton(cc, value);
            break;

        case isPolyPressure(status):
            handleAftertouch(cc, value);
            break;

        default:
            log(`UNKNOWN STATUS: ${status}, cc: ${cc}, value: ${value}`)
            break;
    }
    return
}

/* ------------------------------------------------------ */
/*                UPDATE CONTROLLER STATE                 */
/* ------------------------------------------------------ */

function flush() {
}
