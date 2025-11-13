/**
 * Exemplo de arquivo TypeScript com várias keywords
 * que devem ser preservadas nos arquivos .d.ts
 */

/**
 * Classe abstrata de exemplo
 */
export abstract class BaseComponent {
	protected readonly id: string;
	private _active: boolean = false;
	public name: string;

	constructor(id: string, name: string) {
		this.id = id;
		this.name = name;
	}

	/**
	 * Método abstrato que deve ser implementado
	 */
	abstract render(): void;

	/**
	 * Método estático assíncrono
	 */
	static async create(id: string, name: string): Promise<BaseComponent> {
		// Simulação de operação assíncrona
		await new Promise((resolve) => setTimeout(resolve, 100));
		throw new Error("Must be implemented by subclass");
	}

	/**
	 * Getter/Setter com modificadores
	 */
	protected get active(): boolean {
		return this._active;
	}

	protected set active(value: boolean) {
		this._active = value;
	}
}

/**
 * Classe concreta que estende BaseComponent
 */
export class Button extends BaseComponent {
	private readonly type: "button" | "submit" = "button";
	static readonly DEFAULT_LABEL = "Click me";

	override render(): void {
		console.log(`Rendering button: ${this.name}`);
	}

	static override async create(
		id: string,
		name: string,
	): Promise<Button> {
		await new Promise((resolve) => setTimeout(resolve, 50));
		return new Button(id, name);
	}
}

/**
 * Interface com readonly
 */
export interface IConfig {
	readonly apiUrl: string;
	readonly timeout: number;
	retries: number;
}

/**
 * Classe com membros estáticos
 */
export class Utils {
	private static instance: Utils;

	private constructor() {}

	static getInstance(): Utils {
		if (!Utils.instance) {
			Utils.instance = new Utils();
		}
		return Utils.instance;
	}

	static async delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
