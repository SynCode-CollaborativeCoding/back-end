export class Logger {
    static log(category, message) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${category}] ${message}`);
    }
}
