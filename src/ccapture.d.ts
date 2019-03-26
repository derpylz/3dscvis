declare class CCapture {
    format: string;
    framerate: number;
    workersPath: string;
    verbose: boolean;
    display: boolean;
    quality: number;
    workers: number;
    constructor(
        options?: Object
    )
    start(): void;
    capture(canvas: HTMLCanvasElement): void;
    stop(): void;
    save(): void;
}
