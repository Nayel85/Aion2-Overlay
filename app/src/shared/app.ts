/**
 * The app's name: shown in the panel header, window title and tray tooltip. Keep it equal to
 * productName in package.json and electron-builder.yml. It was "Aion 2 Drop Tracker" until 0.1.11,
 * "Aion2 Pet Tracker" until 0.2.0, "Nyerk" until 0.3.0 (main/migrate.ts moves those folders
 * across) and "Lokthar" until Nayel85's build.
 */
export const DISPLAY_NAME = 'Nayel Overlay'
/**
 * Lokthar's data folder (%APPDATA%\Lokthar): copied whole into this app's (%APPDATA%\Nayel Overlay)
 * on its first start (migrate.ts copyDataFolder), and left as it was, for Lokthar.
 */
export const LOKTHAR_FOLDER = 'Lokthar'
