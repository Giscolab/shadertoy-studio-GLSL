/**
 * MidiHandler.js — Shader Studio v5
 * Gestion de l'API Web MIDI et des mappings CC
 */

export class MidiHandler {
    constructor() {
        this.access = null;
        this.inputs = [];
        this.mappings = {}; // Format: "channel:cc" -> "paramId"
        this.lastMsg = { ch: -1, cc: -1, val: 0 };
        this.onMidMessage = null; // Callback (ch, cc, val) => {}
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            console.warn("Web MIDI API non supportée par ce navigateur.");
            return false;
        }
        try {
            this.access = await navigator.requestMIDIAccess({ sysex: false });
            this.updateInputs();
            this.access.onstatechange = () => this.updateInputs();
            return true;
        } catch (e) {            
            if (e instanceof DOMException && (e.name === 'SecurityError' || e.name === 'NotAllowedError')) {
                console.error('MIDI Access denied by user:', e);
                return false;
            }

            console.error('MIDI Access failed', e);
            return false;
        }
    }

    updateInputs() {
        this.inputs = Array.from(this.access.inputs.values());
        this.inputs.forEach(input => {
            input.onmidimessage = (e) => {
                const [status, data1, data2] = e.data;
                const type = status & 0xf0;
                const channel = status & 0x0f;
                if (type === 176 && this.onMidMessage) { // Control Change (CC)
                    this.lastMsg = { ch: channel, cc: data1, val: data2 };
                    this.onMidMessage(channel, data1, data2);
                }
            };
        });
    }
}