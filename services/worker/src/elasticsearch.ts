import { Client } from '@elastic/elasticsearch';
import { config } from './config';

export const esClient = new Client({
  node: config.elasticsearch.url,
  requestTimeout: 10000,
  sniffOnStart: false,
});

export let elasticsearchAvailable = false;

export async function connectElasticsearch(): Promise<void> {
  try {
    const info = await esClient.info();
    elasticsearchAvailable = true;
    console.log(`[Elasticsearch] Connected. Cluster: "${info.cluster_name}", version: ${info.version.number}`);
  } catch (err: any) {
    elasticsearchAvailable = false;
    console.warn(
      '[Elasticsearch] Could not connect on startup:',
      err.message,
      '— search indexing will be skipped until Elasticsearch is available.'
    );
  }
}

/**
 * Ensure a given index exists with the provided mapping.
 * If Elasticsearch is unavailable this is a no-op (logs a warning).
 */
export async function ensureIndex(
  indexName: string,
  mappingProperties: Record<string, any>
): Promise<void> {
  if (!elasticsearchAvailable) {
    console.warn(`[Elasticsearch] Skipping ensureIndex for "${indexName}" — not connected.`);
    return;
  }

  try {
    const exists = await esClient.indices.exists({ index: indexName });
    if (!exists) {
      await esClient.indices.create({
        index: indexName,
        mappings: {
          properties: mappingProperties,
        },
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      });
      console.log(`[Elasticsearch] Index "${indexName}" created with mapping.`);
    } else {
      console.log(`[Elasticsearch] Index "${indexName}" already exists.`);
    }
  } catch (err: any) {
    console.warn(`[Elasticsearch] Could not ensure index "${indexName}":`, err.message);
  }
}
