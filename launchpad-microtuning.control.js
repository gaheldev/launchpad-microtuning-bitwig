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
    sysex(`0E ${modeHex}`);
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
const Palette = {
    OFF: [0, 0, 0],
    WHITE: [127, 127, 127],
    BLUE: [8, 75, 127],
    PINK: [127, 0, 103],
    PALE_GREEN: [99, 127, 0],
    GREEN: [0,127,0],
    ORANGE: [127, 73, 0],
}


/* ------------------------- LED ------------------------ */

/// channel on which the message should be sent
const LightingType = {
    STATIC: 0,
    FLASHING: 1,
    PULSING: 2,
    RGB: 3,
}

/// color in [0,127] is from the default palette defined page 12 of the reference
/// favor setRGB
function setLED(padIndex, color, lightingType=LightingType.STATIC) {
    midiOut.sendMidi(noteOnChannel(lightingType+1), padIndex.midiId, color);
}

function adjustBrightness(rgbColor, brightness) {
    return [Math.round(rgbColor[0]*brightness),
            Math.round(rgbColor[1]*brightness),
            Math.round(rgbColor[2]*brightness),
            ]
}

function setRGB(padIndex, rgbColor, brightness=1.0) {
    let adjustedColor = adjustBrightness(rgbColor, brightness);
    sysex(  '03 ' 
          + toHex(LightingType.RGB) + ' '
          + toHex(padIndex.midiId) + ' '
          + toHex(adjustedColor[0]) + ' '
          + toHex(adjustedColor[1]) + ' '
          + toHex(adjustedColor[2])
    );
}



function resetLEDS() {
    for (let i = 1; i <= 8; i++) {
        for (let j = 1; j <= 8; j++) {
            let padIndex = PadIndex.fromIndex(i,j);
            setRGB(padIndex, edo19.color(padIndex));
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

/// return hexa string with 2 numbers from int
function toHex(d) {
    return  ("0"+(Number(d).toString(16))).slice(-2).toUpperCase()
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
        this.midiMap = this.getMap(); // pad -> midi
    }

    // for n fingers chromaticfrom left->right and then bot->top
    // 8  fingers -> chromatic with no repeating notes
    // 5  fingers -> chromatic while staying inside 5 columns
    index(padIndex, fingers=5) {
        return fingers*(padIndex.row-1) + (padIndex.col-1);
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

    getEquivalentPads(midiId) {
        // let m = Array(128).fill().map(() => -1); // initialize to -1 to filter all unspecified values
        let pads = [];
        for (let i = 1; i <= 8; i++) {
            for (let j = 1; j <= 8; j++) {
                let padIndex = PadIndex.fromIndex(i,j);
                if (this.midi(padIndex) === this.midiMap[midiId])
                {
                    // log(`MIDI ID: ${midiId}, row: ${padIndex.row}, col: ${padIndex.col}, padId: ${padIndex.midiId}`);
                    pads.push(padIndex)
                }
            }
        }
        return pads;
    }

    color(padIndex) {
        let offset = Math.ceil(127/this.divisions) * 19; // make sure next line modulo is alway for positive integer
        let degree = (this.midi(padIndex) - this.rootKey + offset) % this.divisions + 1;

        switch (degree) {
            case 1:   return adjustBrightness(Palette.PINK, 1.0);
            case 2:   return adjustBrightness(Palette.BLUE, 0.1);
            case 3:   return adjustBrightness(Palette.ORANGE, 0.1);

            case 4:   return adjustBrightness(Palette.WHITE, 1.0);
            case 5:   return adjustBrightness(Palette.BLUE, 0.1);
            case 6:   return adjustBrightness(Palette.ORANGE, 0.1);

            case 7:   return adjustBrightness(Palette.WHITE, 1.0);
            case 8:   return adjustBrightness(Palette.PALE_GREEN, 0.1);

            case 9:   return adjustBrightness(Palette.WHITE, 1.0);
            case 10:  return adjustBrightness(Palette.BLUE, 0.1);
            case 11:  return adjustBrightness(Palette.ORANGE, 0.1);

            case 12:  return adjustBrightness(Palette.WHITE, 1.0);
            case 13:  return adjustBrightness(Palette.BLUE, 0.1);
            case 14:  return adjustBrightness(Palette.ORANGE, 0.1);

            case 15:  return adjustBrightness(Palette.WHITE, 1.0);
            case 16:  return adjustBrightness(Palette.BLUE, 0.1);
            case 17:  return adjustBrightness(Palette.ORANGE, 0.1);

            case 18:  return adjustBrightness(Palette.WHITE, 1.0);
            case 19:  return adjustBrightness(Palette.PALE_GREEN, 0.1);

            default: return Palette.OFF;
        }
    }
}

const edo19 = new Mapping();
// log(edo19.getMap().toString());


/* ----------------------- NOTE ON ---------------------- */
function handleNoteOn(cc, value) {
    try {
        log(`handleNoteOn -> ${cc} : ${value}`)

        padIndex = PadIndex.fromID(cc);
        log(`row: ${padIndex.row}, col: ${padIndex.col}`);
        for (const padIndex of edo19.getEquivalentPads(cc))
        {
            log(padIndex.toString());
            setRGB(padIndex, Palette.GREEN);
        }
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
        for (const padIndex of edo19.getEquivalentPads(cc))
            setRGB(padIndex, edo19.color(padIndex));
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
