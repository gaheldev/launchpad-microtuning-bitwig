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

const NOTE_ON = 0x90
const NOTE_OFF = 0x80
const CC = 0xb0

/// 1 <= chan <= 16
function noteOnChannel(chan) {
    return NOTE_ON + chan - 1;
}


/* ------------------------------------------------------ */
/*                        HARDWARE                        */
/* ------------------------------------------------------ */
const Mode = {
    LIVE: 0,
    PROGRAMMER: 1,
};

function setMode(mode) {
    const modeHex = mode == 0 ? "00" : "01";
    midiOut.sendSysex(`F0 00 20 29 02 0C 0E ${modeHex} F7`);
}

/* ------------------- PADS / BUTTONS  ------------------ */

class PadIndex {
    /// 1 <= row, column <= 9
    /// Class fields are not compatible with bitwig
    // row;
    // col;
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
    WHITE: 3,
    RED: 5,
    ORANGE: 9,
    GREEN: 21,
    PALE_GREEN: 17,
    BLUE: 37,
    PURPLE: 45,
    PINK: 53,
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


/* ------------------------------------------------------ */
/*                     INIT CONTROLLER                    */
/* ------------------------------------------------------ */
function init() {
    // sending to host (bitwig)
    midiIn = host.getMidiInPort(0)
    midiIn.setMidiCallback(onMidi)

    // sending to controller (launchpad) -> LED
    midiOut = host.getMidiOutPort(0)

    // Cursor track
    cursorTrack = host.createCursorTrack("CURSOR_TRACK", "Cursor Track", 0, 0, true);

    setMode(Mode.PROGRAMMER);
}

function exit() {
    setMode(Mode.LIVE);
    log("exit()")
}

/* ------------------------------------------------------ */
/*                   MIDI STATUS HANDLER                  */
/* ------------------------------------------------------ */

/* ----------------------- NOTE ON ---------------------- */
function handleNoteOn(cc, value) {
    try {
        log(`handleNoteOn -> ${cc} : ${value}`)

        padIndex = PadIndex.fromID(cc);
        // log(`row: ${padIndex.row}, col: ${padIndex.col}`);
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
        setLED(padIndex, Palette.OFF);
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
            if (isButton(cc)) handleButton(cc, value);
            else if (value === 0) handleNoteOff(cc, value);
            else handleNoteOn(cc, value);
            break;

        case isNoteOff(status): handleNoteOff(cc, value); break;

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
