import { validateRequired, sanitizeLimit, buildFilterParams, buildFieldParams } from '../utils/index.js';
export class LocalizationHandlers {
    client;
    constructor(client) {
        this.client = client;
    }
    async listAppStoreVersions(args) {
        const { appId, limit = 100, filter } = args;
        validateRequired(args, ['appId']);
        const params = {
            limit: sanitizeLimit(limit)
        };
        if (filter?.platform) {
            params['filter[platform]'] = filter.platform;
        }
        if (filter?.versionString) {
            params['filter[versionString]'] = filter.versionString;
        }
        if (filter?.appStoreState) {
            params['filter[appStoreState]'] = filter.appStoreState;
        }
        return this.client.get(`/apps/${appId}/appStoreVersions`, params);
    }
    async listAppStoreVersionLocalizations(args) {
        const { appStoreVersionId, limit = 100, filter, fields } = args;
        validateRequired(args, ['appStoreVersionId']);
        const sanitizedLimit = sanitizeLimit(limit);
        const params = {
            limit: sanitizedLimit
        };
        Object.assign(params, buildFilterParams(filter));
        Object.assign(params, buildFieldParams(fields));
        const response = await this.client.get(`/appStoreVersions/${appStoreVersionId}/appStoreVersionLocalizations`, params);
        // Fallback enforcement: if the upstream API ignores filter/fields/limit, trim locally
        let data = response.data ?? [];
        let changed = false;
        if (filter?.locale) {
            data = data.filter((loc) => loc.attributes?.locale === filter.locale);
            changed = true;
        }
        if (fields?.appStoreVersionLocalizations?.length) {
            const keepFields = new Set([
                ...fields.appStoreVersionLocalizations,
                'locale' // always keep locale so the record stays identifiable
            ]);
            data = data.map((loc) => ({
                ...loc,
                attributes: Object.fromEntries(Object.entries(loc.attributes || {}).filter(([key]) => keepFields.has(key)))
            }));
            changed = true;
        }
        if (data.length > sanitizedLimit) {
            data = data.slice(0, sanitizedLimit);
            changed = true;
        }
        if (!changed) {
            return response;
        }
        const meta = {
            ...(response.meta || {}),
            paging: {
                total: data.length,
                limit: sanitizedLimit
            }
        };
        const links = response.links ? { ...response.links } : undefined;
        if (links?.next) {
            delete links.next;
        }
        return {
            ...response,
            data,
            meta,
            links
        };
    }
    async getAppStoreVersionLocalization(args) {
        const { localizationId } = args;
        validateRequired(args, ['localizationId']);
        return this.client.get(`/appStoreVersionLocalizations/${localizationId}`);
    }
    async updateAppStoreVersionLocalization(args) {
        const { localizationId, field, value } = args;
        validateRequired(args, ['localizationId', 'field', 'value']);
        // Validate field
        const validFields = [
            'description', 'keywords', 'marketingUrl',
            'promotionalText', 'supportUrl', 'whatsNew'
        ];
        if (!validFields.includes(field)) {
            throw new Error(`Invalid field: ${field}. Must be one of: ${validFields.join(', ')}`);
        }
        const requestData = {
            data: {
                type: 'appStoreVersionLocalizations',
                id: localizationId,
                attributes: {
                    [field]: value
                }
            }
        };
        return this.client.patch(`/appStoreVersionLocalizations/${localizationId}`, requestData);
    }
    async createAppStoreVersion(args) {
        const { appId, platform, versionString, copyright, releaseType, earliestReleaseDate, buildId } = args;
        validateRequired(args, ['appId', 'platform', 'versionString']);
        // Validate version string format
        const versionRegex = /^\d+\.\d+(\.\d+)?$/;
        if (!versionRegex.test(versionString)) {
            throw new Error('Version string must be in format X.Y or X.Y.Z (e.g., 1.0 or 1.0.0)');
        }
        // Validate release date if provided
        if (earliestReleaseDate) {
            const date = new Date(earliestReleaseDate);
            if (isNaN(date.getTime())) {
                throw new Error('Invalid release date format. Use ISO 8601 format (e.g., 2024-01-01T00:00:00Z)');
            }
            if (releaseType !== 'SCHEDULED') {
                throw new Error('earliestReleaseDate can only be set when releaseType is SCHEDULED');
            }
        }
        const requestData = {
            data: {
                type: 'appStoreVersions',
                attributes: {
                    platform,
                    versionString,
                    ...(copyright && { copyright }),
                    ...(releaseType && { releaseType }),
                    ...(earliestReleaseDate && { earliestReleaseDate })
                },
                relationships: {
                    app: {
                        data: {
                            type: 'apps',
                            id: appId
                        }
                    },
                    ...(buildId && {
                        build: {
                            data: {
                                type: 'builds',
                                id: buildId
                            }
                        }
                    })
                }
            }
        };
        return this.client.post('/appStoreVersions', requestData);
    }
    async listAppCustomProductPageVersions(args) {
        const { appCustomProductPageId, limit = 100 } = args;
        validateRequired(args, ['appCustomProductPageId']);
        const params = {
            limit: sanitizeLimit(limit),
            'filter[appCustomProductPage]': appCustomProductPageId
        };
        return this.client.get('/appCustomProductPageVersions', params);
    }
    async listAppCustomProductPageVersionLocalizations(args) {
        const { appCustomProductPageVersionId, limit = 200 } = args;
        validateRequired(args, ['appCustomProductPageVersionId']);
        const params = {
            limit: sanitizeLimit(limit),
            'filter[appCustomProductPageVersion]': appCustomProductPageVersionId
        };
        return this.client.get('/appCustomProductPageLocalizations', params);
    }
    async listAppCustomProductPageLocalizations(args) {
        const { appCustomProductPageId, versionLimit = 100, localizationLimit = 200 } = args;
        validateRequired(args, ['appCustomProductPageId']);
        const versionsResponse = await this.listAppCustomProductPageVersions({
            appCustomProductPageId,
            limit: versionLimit
        });
        const versionsWithLocalizations = await Promise.all(versionsResponse.data.map(async (version) => {
            const localizationsResponse = await this.listAppCustomProductPageVersionLocalizations({
                appCustomProductPageVersionId: version.id,
                limit: localizationLimit
            });
            return {
                version,
                localizations: localizationsResponse.data,
                links: localizationsResponse.links,
                meta: localizationsResponse.meta
            };
        }));
        return {
            appCustomProductPageId,
            versions: versionsWithLocalizations,
            links: versionsResponse.links,
            meta: versionsResponse.meta
        };
    }
}
