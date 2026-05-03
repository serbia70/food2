export interface LegacyRestaurantRecord {
	id: number;
	name: string;
	slug: string;
	password: string | null;
	phone: string | null;
	address: string | null;
	status: string | null;
	settings: string | null;
	expire_date: string | null;
	last_paid_month: string | null;
	commission_type: string | null;
	commission_value: number | null;
	enable_delivery: number | null;
	enable_dine_in: number | null;
	enable_reservation: number | null;
	mqtt_secret: string | null;
	table_config: string | null;
	category: string | null;
	city: string | null;
	zone: string | null;
	delivery_type: string | null;
}

export interface ShopInsertRecord {
	id: number;
	name: string;
	slug: string;
	password: string | null;
	phone: string | null;
	address: string | null;
	status: string | null;
	settings: string;
	expire_date: string | null;
	last_paid_month: string | null;
	commission_type: string | null;
	commission_value: number | null;
	enable_delivery: number | null;
	enable_dine_in: number | null;
	enable_reservation: number | null;
	mqtt_secret: string | null;
	table_config: string | null;
	category: string | null;
	city: string | null;
	zone: string | null;
	delivery_type: string | null;
}

type JsonObject = Record<string, unknown>;
type TableZone = { name: string; count: number; prefix?: string };
type TableConfig = { zones: TableZone[] };
type MigrationCounts = { categories: number; products: number; orders: number };
type MigrationCountSummary = {
	legacy: number;
	target: number;
	delta: number;
	needsImport: boolean;
};

function parseJSONObject(raw: string | null | undefined): JsonObject {
	if (typeof raw !== 'string' || raw.trim() === '') return {};
	try {
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed as JsonObject
			: {};
	} catch {
		return {};
	}
}

export function buildImportedSettings(raw: string | null | undefined): JsonObject {
	return parseJSONObject(raw);
}

export function normalizeLegacyTableConfig(raw: string | null | undefined): TableConfig {
	const parsed = parseJSONObject(raw);
	const zones = Array.isArray(parsed.zones) ? parsed.zones : [];
	return {
		zones: zones
			.map((zone) => ({
				name: String((zone as JsonObject).name || '').trim(),
				count: Math.max(0, Number((zone as JsonObject).count || 0)),
				prefix: String((zone as JsonObject).prefix || '').trim() || undefined,
			}))
			.filter((zone) => zone.name && zone.count > 0),
	};
}

export function buildShopInsertRecord(legacy: LegacyRestaurantRecord): ShopInsertRecord {
	return {
		id: legacy.id,
		name: legacy.name,
		slug: legacy.slug,
		password: legacy.password,
		phone: legacy.phone,
		address: legacy.address,
		status: legacy.status,
		settings: JSON.stringify(buildImportedSettings(legacy.settings)),
		expire_date: legacy.expire_date,
		last_paid_month: legacy.last_paid_month,
		commission_type: legacy.commission_type,
		commission_value: legacy.commission_value,
		enable_delivery: legacy.enable_delivery,
		enable_dine_in: legacy.enable_dine_in,
		enable_reservation: legacy.enable_reservation,
		mqtt_secret: legacy.mqtt_secret,
		table_config: legacy.table_config,
		category: legacy.category,
		city: legacy.city,
		zone: legacy.zone,
		delivery_type: legacy.delivery_type,
	};
}

export function buildMigrationStatsComparison(input: {
	legacy: MigrationCounts;
	target: MigrationCounts;
}): Record<keyof MigrationCounts, MigrationCountSummary> {
	return {
		categories: {
			legacy: input.legacy.categories,
			target: input.target.categories,
			delta: input.legacy.categories - input.target.categories,
			needsImport: input.legacy.categories !== input.target.categories,
		},
		products: {
			legacy: input.legacy.products,
			target: input.target.products,
			delta: input.legacy.products - input.target.products,
			needsImport: input.legacy.products !== input.target.products,
		},
		orders: {
			legacy: input.legacy.orders,
			target: input.target.orders,
			delta: input.legacy.orders - input.target.orders,
			needsImport: input.legacy.orders !== input.target.orders,
		},
	};
}
