import './style.css';
import { Morph } from './morph';
import { sharedScroll } from './stage';

const morph = new Morph();
morph.mount();

// sous la main dans la console pendant le developpement
if (import.meta.env.DEV) Object.assign(window, { morph, lenis: sharedScroll() });
