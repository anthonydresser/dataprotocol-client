import { DynamicFeature, ServerCapabilities, RegistrationData,
	RPCMessageType, Disposable,
} from 'vscode-languageclient';


import * as UUID from 'vscode-languageclient/lib/utils/uuid';

import * as sqlops from 'sqlops';

import * as protocol from './protocol';
import * as types from './types';
import { SqlOpsDataClient } from './main';

import * as is from 'vscode-languageclient/lib/utils/is';

function ensure<T, K extends keyof T>(target: T, key: K): T[K] {
	if (target[key] === void 0) {
		target[key] = {} as any;
	}
	return target[key];
}

/**
 *
 */
export abstract class SqlOpsFeature<T> implements DynamicFeature<T> {

	protected _providers: Map<string, Disposable> = new Map<string, Disposable>();

	constructor(protected _client: SqlOpsDataClient, private _message: RPCMessageType | RPCMessageType[]) {
	}

	public get messages(): RPCMessageType | RPCMessageType[] {
		return this._message;
	}

	public abstract fillClientCapabilities(capabilities: protocol.ClientCapabilities): void;

	public abstract initialize(capabilities: ServerCapabilities): void;

	public register(messages: RPCMessageType | RPCMessageType[], data: RegistrationData<T>): void {
		// Error catching
		if (is.array<RPCMessageType>(this.messages) && is.array<RPCMessageType>(messages)) {
			let valid = messages.every(v => !!(this.messages as RPCMessageType[]).find(i => i.method === v.method));
			if (!valid) {
				throw new Error(`Register called on wrong feature.`);
			}
		} else if (is.array<RPCMessageType>(this.messages) && !is.array<RPCMessageType>(messages)) {
			if (!this.messages.find(i => i.method === messages.method)) {
				throw new Error(`Register called on wrong feature.`);
			}
		} else if (!is.array<RPCMessageType>(this.messages) && !is.array<RPCMessageType>(messages)) {
			if (this.messages.method !== messages.method) {
				throw new Error(`Register called on wrong feature. Requested ${messages.method} but reached feature ${this.messages.method}`);
			}
		}

		let provider = this.registerProvider(data.registerOptions);
		if (provider) {
			this._providers.set(data.id, provider);
		}
	}

	protected abstract registerProvider(options: T): Disposable;

	public unregister(id: string): void {
		let provider = this._providers.get(id);
		if (provider) {
			provider.dispose();
		}
	}

	public dispose(): void {
		this._providers.forEach((value) => {
			value.dispose();
		});
	}
}

export class CapabilitiesFeature extends SqlOpsFeature<undefined> {

	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.CapabiltiesDiscoveryRequest.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, CapabilitiesFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'capabilities')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;

		let getServerCapabilities = (cap: sqlops.DataProtocolClientCapabilities): Thenable<sqlops.DataProtocolServerCapabilities> => {
			return client.sendRequest(protocol.CapabiltiesDiscoveryRequest.type, cap).then(
				r => r.capabilities,
				e => {
					client.logFailedRequest(protocol.CapabiltiesDiscoveryRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		return sqlops.dataprotocol.registerCapabilitiesServiceProvider({
			providerId: client.providerId,
			getServerCapabilities
		});
	}
}

export class ConnectionFeature extends SqlOpsFeature<undefined> {

	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.ConnectionRequest.type,
		protocol.ConnectionCompleteNotification.type,
		protocol.ConnectionChangedNotification.type,
		protocol.DisconnectRequest.type,
		protocol.CancelConnectRequest.type,
		protocol.ChangeDatabaseRequest.type,
		protocol.ListDatabasesRequest.type,
		protocol.LanguageFlavorChangedNotification.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, ConnectionFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'connection')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;
		let connect = (connUri: string, connInfo: sqlops.ConnectionInfo): Thenable<boolean> => {
			return client.sendRequest(protocol.ConnectionRequest.type, client.sqlc2p.asConnectionParams(connUri, connInfo)).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.ConnectionRequest.type, e);
					return Promise.resolve(false);
				}
			);
		};

		let disconnect = (ownerUri: string): Thenable<boolean> => {
			let params: protocol.DisconnectParams = {
				ownerUri
			};

			return client.sendRequest(protocol.DisconnectRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.DisconnectRequest.type, e);
					return Promise.resolve(false);
				}
			);
		};

		let cancelConnect = (ownerUri: string): Thenable<boolean> => {
			let params: protocol.CancelConnectParams = {
				ownerUri
			};

			return client.sendRequest(protocol.CancelConnectRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.CancelConnectRequest.type, e);
					return Promise.resolve(false);
				}
			);
		};

		let changeDatabase = (ownerUri: string, newDatabase: string): Thenable<boolean> => {
			let params: protocol.ChangeDatabaseParams = {
				ownerUri,
				newDatabase
			};

			return client.sendRequest(protocol.ChangeDatabaseRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.ChangeDatabaseRequest.type, e);
					return Promise.resolve(false);
				}
			);
		};

		let listDatabases = (ownerUri: string): Thenable<sqlops.ListDatabasesResult> => {
			let params: protocol.ListDatabasesParams = {
				ownerUri
			};

			return client.sendRequest(protocol.ListDatabasesRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.ListDatabasesRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let rebuildIntelliSenseCache = (ownerUri: string): Thenable<void> => {
			let params: protocol.RebuildIntelliSenseParams = {
				ownerUri
			};

			client.sendNotification(protocol.RebuildIntelliSenseNotification.type, params);
			return Promise.resolve();
		};

		let registerOnConnectionComplete = (handler: (connSummary: sqlops.ConnectionInfoSummary) => any): void => {
			client.onNotification(protocol.ConnectionCompleteNotification.type, handler);
		};

		let registerOnIntelliSenseCacheComplete = (handler: (connectionUri: string) => any): void => {
			client.onNotification(protocol.IntelliSenseReadyNotification.type, (params: types.IntelliSenseReadyParams) => {
				handler(params.ownerUri);
			});
		};

		let registerOnConnectionChanged = (handler: (changedConnInfo: sqlops.ChangedConnectionInfo) => any): void => {
			client.onNotification(protocol.ConnectionChangedNotification.type, (params: protocol.ConnectionChangedParams) => {
				handler({
					connectionUri: params.ownerUri,
					connection: params.connection
				});
			});
		};

		return sqlops.dataprotocol.registerConnectionProvider({
			providerId: client.providerId,
			connect,
			disconnect,
			cancelConnect,
			changeDatabase,
			listDatabases,
			rebuildIntelliSenseCache,
			registerOnConnectionChanged,
			registerOnIntelliSenseCacheComplete,
			registerOnConnectionComplete
		});
	}
}

export class QueryFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.QueryExecuteRequest.type,
		protocol.QueryCancelRequest.type,
		protocol.QueryExecuteStatementRequest.type,
		protocol.QueryExecuteStringRequest.type,
		protocol.SimpleExecuteRequest.type,
		protocol.QueryExecuteSubsetRequest.type,
		protocol.QueryDisposeRequest.type,
		protocol.QueryExecuteCompleteNotification.type,
		protocol.QueryExecuteBatchStartNotification.type,
		protocol.QueryExecuteBatchCompleteNotification.type,
		protocol.QueryExecuteResultSetCompleteNotification.type,
		protocol.QueryExecuteMessageNotification.type,
		protocol.SaveResultsAsCsvRequest.type,
		protocol.SaveResultsAsJsonRequest.type,
		protocol.SaveResultsAsExcelRequest.type,
		protocol.EditCommitRequest.type,
		protocol.EditCreateRowRequest.type,
		protocol.EditDeleteRowRequest.type,
		protocol.EditDisposeRequest.type,
		protocol.EditInitializeRequest.type,
		protocol.EditRevertCellRequest.type,
		protocol.EditRevertRowRequest.type,
		protocol.EditUpdateCellRequest.type,
		protocol.EditSubsetRequest.type,
		protocol.EditSessionReadyNotification.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, QueryFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'query')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;
		let runQuery = (ownerUri: string, querySelection: sqlops.ISelectionData, executionPlanOptions?: sqlops.ExecutionPlanOptions): Thenable<void> => {
			let params: sqlops.QueryExecuteParams = {
				ownerUri,
				querySelection,
				executionPlanOptions: client.sqlc2p.asExecutionPlanOptions(executionPlanOptions)
			};
			return client.sendRequest(protocol.QueryExecuteRequest.type, params).then(
				r => undefined,
				e => {
					client.logFailedRequest(protocol.QueryExecuteRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let cancelQuery = (ownerUri: string): Thenable<sqlops.QueryCancelResult> => {
			let params: protocol.QueryCancelParams = { ownerUri };
			return client.sendRequest(protocol.QueryCancelRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.QueryCancelRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let runQueryStatement = (ownerUri: string, line: number, column: number): Thenable<void> => {
			let params: protocol.QueryExecuteStatementParams = {
				ownerUri,
				line,
				column
			};
			return client.sendRequest(protocol.QueryExecuteStatementRequest.type, params).then(
				r => undefined,
				e => {
					client.logFailedRequest(protocol.QueryExecuteStatementRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let runQueryString = (ownerUri: string, query: string): Thenable<void> => {
			let params: protocol.QueryExecuteStringParams = { ownerUri, query };
			return client.sendRequest(protocol.QueryExecuteStringRequest.type, params).then(
				r => undefined,
				e => {
					client.logFailedRequest(protocol.QueryExecuteStringRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let runQueryAndReturn = (ownerUri: string, queryString: string): Thenable<sqlops.SimpleExecuteResult> => {
			let params: sqlops.SimpleExecuteParams = { ownerUri, queryString };
			return client.sendRequest(protocol.SimpleExecuteRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.SimpleExecuteRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let getQueryRows = (rowData: sqlops.QueryExecuteSubsetParams): Thenable<sqlops.QueryExecuteSubsetResult> => {
			return client.sendRequest(protocol.QueryExecuteSubsetRequest.type, rowData).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.QueryExecuteSubsetRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let disposeQuery = (ownerUri: string): Thenable<void> => {
			let params: protocol.QueryDisposeParams = { ownerUri };
			return client.sendRequest(protocol.QueryDisposeRequest.type, params).then(
				r => undefined,
				e => {
					client.logFailedRequest(protocol.QueryDisposeRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let registerOnQueryComplete = (handler: (result: sqlops.QueryExecuteCompleteNotificationResult) => any): void => {
			client.onNotification(protocol.QueryExecuteCompleteNotification.type, handler);
		};

		let registerOnBatchStart = (handler: (batchInfo: sqlops.QueryExecuteBatchNotificationParams) => any): void => {
			client.onNotification(protocol.QueryExecuteBatchStartNotification.type, handler);
		};

		let registerOnBatchComplete = (handler: (batchInfo: sqlops.QueryExecuteBatchNotificationParams) => any): void => {
			client.onNotification(protocol.QueryExecuteBatchCompleteNotification.type, handler);
		};

		let registerOnResultSetComplete = (handler: (resultSetInfo: sqlops.QueryExecuteResultSetCompleteNotificationParams) => any): void => {
			client.onNotification(protocol.QueryExecuteResultSetCompleteNotification.type, handler);
		};

		let registerOnMessage = (handler: (message: sqlops.QueryExecuteMessageParams) => any): void => {
			client.onNotification(protocol.QueryExecuteMessageNotification.type, handler);
		};

		let saveResults = (requestParams: sqlops.SaveResultsRequestParams): Thenable<sqlops.SaveResultRequestResult> => {
			switch (requestParams.resultFormat) {
				case 'csv':
					return client.sendRequest(protocol.SaveResultsAsCsvRequest.type, requestParams).then(
						undefined,
						e => {
							client.logFailedRequest(protocol.SaveResultsAsCsvRequest.type, e);
							return Promise.reject(e);
						}
					);
				case 'json':
					return client.sendRequest(protocol.SaveResultsAsJsonRequest.type, requestParams).then(
						undefined,
						e => {
							client.logFailedRequest(protocol.SaveResultsAsJsonRequest.type, e);
							return Promise.reject(e);
						}
					);
				case 'excel':
					return client.sendRequest(protocol.SaveResultsAsExcelRequest.type, requestParams).then(
						undefined,
						e => {
							client.logFailedRequest(protocol.SaveResultsAsExcelRequest.type, e);
							return Promise.reject(e);
						}
					);
				default:
					return Promise.reject('unsupported format');
			}
		};

		// Edit Data Requests
		let commitEdit = (ownerUri: string): Thenable<void> => {
			let params: sqlops.EditCommitParams = { ownerUri };
			return client.sendRequest(protocol.EditCommitRequest.type, params).then(
				r => undefined,
				e => {
					client.logFailedRequest(protocol.EditCommitRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let createRow = (ownerUri: string): Thenable<sqlops.EditCreateRowResult> => {
			let params: sqlops.EditCreateRowParams = { ownerUri: ownerUri };
			return client.sendRequest(protocol.EditCreateRowRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.EditCreateRowRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let deleteRow = (ownerUri: string, rowId: number): Thenable<void> => {
			let params: sqlops.EditDeleteRowParams = { ownerUri, rowId };
			return client.sendRequest(protocol.EditDeleteRowRequest.type, params).then(
				r => undefined,
				e => {
					client.logFailedRequest(protocol.EditDeleteRowRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let disposeEdit = (ownerUri: string): Thenable<void> => {
			let params: sqlops.EditDisposeParams = { ownerUri };
			return client.sendRequest(protocol.EditDisposeRequest.type, params).then(
				r => undefined,
				e => {
					client.logFailedRequest(protocol.EditDisposeRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let initializeEdit = (ownerUri: string, schemaName: string, objectName: string, objectType: string, LimitResults: number): Thenable<void> => {
			let filters: sqlops.EditInitializeFiltering = { LimitResults };
			let params: sqlops.EditInitializeParams = { ownerUri, schemaName, objectName, objectType, filters };
			return client.sendRequest(protocol.EditInitializeRequest.type, params).then(
				r => undefined,
				e => {
					client.logFailedRequest(protocol.EditInitializeRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let revertCell = (ownerUri: string, rowId: number, columnId: number): Thenable<sqlops.EditRevertCellResult> => {
			let params: sqlops.EditRevertCellParams = { ownerUri, rowId, columnId };
			return client.sendRequest(protocol.EditRevertCellRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.EditRevertCellRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let revertRow = (ownerUri: string, rowId: number): Thenable<void> => {
			let params: sqlops.EditRevertRowParams = { ownerUri, rowId };
			return client.sendRequest(protocol.EditRevertRowRequest.type, params).then(
				r => undefined,
				e => {
					client.logFailedRequest(protocol.EditRevertRowRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let updateCell = (ownerUri: string, rowId: number, columnId: number, newValue: string): Thenable<sqlops.EditUpdateCellResult> => {
			let params: sqlops.EditUpdateCellParams = { ownerUri, rowId, columnId, newValue };
			return client.sendRequest(protocol.EditUpdateCellRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.EditUpdateCellRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let getEditRows = (rowData: sqlops.EditSubsetParams): Thenable<sqlops.EditSubsetResult> => {
			return client.sendRequest(protocol.EditSubsetRequest.type, rowData).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.EditSubsetRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		// Edit Data Event Handlers
		let registerOnEditSessionReady = (handler: (ownerUri: string, success: boolean, message: string) => any): void => {
			client.onNotification(protocol.EditSessionReadyNotification.type, (params: sqlops.EditSessionReadyParams) => {
				handler(params.ownerUri, params.success, params.message);
			});
		};

		return sqlops.dataprotocol.registerQueryProvider({
			providerId: client.providerId,
			cancelQuery,
			commitEdit,
			createRow,
			deleteRow,
			disposeEdit,
			disposeQuery,
			getEditRows,
			getQueryRows,
			initializeEdit,
			registerOnBatchComplete,
			registerOnBatchStart,
			registerOnEditSessionReady,
			registerOnMessage,
			registerOnQueryComplete,
			registerOnResultSetComplete,
			revertCell,
			revertRow,
			runQuery,
			runQueryAndReturn,
			runQueryStatement,
			runQueryString,
			saveResults,
			updateCell
		});
	}
}

export class MetadataFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.MetadataQueryRequest.type,
		protocol.ListDatabasesRequest.type,
		protocol.TableMetadataRequest.type,
		protocol.ViewMetadataRequest.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, MetadataFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'metadata')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;

		let getMetadata = (ownerUri: string): Thenable<sqlops.ProviderMetadata> => {
			let params: types.MetadataQueryParams = { ownerUri };
			return client.sendRequest(protocol.MetadataQueryRequest.type, params).then(
				client.sqlp2c.asProviderMetadata,
				e => {
					client.logFailedRequest(protocol.MetadataQueryRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let getDatabases = (ownerUri: string): Thenable<string[]> => {
			let params: protocol.ListDatabasesParams = { ownerUri };
			return client.sendRequest(protocol.ListDatabasesRequest.type, params).then(
				r => r.databaseNames,
				e => {
					client.logFailedRequest(protocol.ListDatabasesRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let getTableInfo = (ownerUri: string, metadata: sqlops.ObjectMetadata): Thenable<sqlops.ColumnMetadata[]> => {
			let params: protocol.TableMetadataParams = { objectName: metadata.name, ownerUri, schema: metadata.schema };
			return client.sendRequest(protocol.TableMetadataRequest.type, params).then(
				r => r.columns,
				e => {
					client.logFailedRequest(protocol.TableMetadataRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let getViewInfo = (ownerUri: string, metadata: sqlops.ObjectMetadata): Thenable<sqlops.ColumnMetadata[]> => {
			let params: protocol.TableMetadataParams = { objectName: metadata.name, ownerUri, schema: metadata.schema };
			return client.sendRequest(protocol.ViewMetadataRequest.type, params).then(
				r => r.columns,
				e => {
					client.logFailedRequest(protocol.ViewMetadataRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		return sqlops.dataprotocol.registerMetadataProvider({
			providerId: client.providerId,
			getDatabases,
			getMetadata,
			getTableInfo,
			getViewInfo
		});
	}
}

class AdminServicesFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.CreateDatabaseRequest.type,
		protocol.DefaultDatabaseInfoRequest.type,
		protocol.GetDatabaseInfoRequest.type,
		protocol.CreateLoginRequest.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, AdminServicesFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'adminServices')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;

		let createDatabase = (ownerUri: string, databaseInfo: sqlops.DatabaseInfo): Thenable<sqlops.CreateDatabaseResponse> => {
			let params: types.CreateDatabaseParams = { ownerUri, databaseInfo };
			return client.sendRequest(protocol.CreateDatabaseRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.CreateDatabaseRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let getDefaultDatabaseInfo = (ownerUri: string): Thenable<sqlops.DatabaseInfo> => {
			let params: types.DefaultDatabaseInfoParams = { ownerUri };
			return client.sendRequest(protocol.DefaultDatabaseInfoRequest.type, params).then(
				r => r.defaultDatabaseInfo,
				e => {
					client.logFailedRequest(protocol.DefaultDatabaseInfoRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let getDatabaseInfo = (ownerUri: string): Thenable<sqlops.DatabaseInfo> => {
			let params: types.GetDatabaseInfoParams = { ownerUri };
			return client.sendRequest(protocol.GetDatabaseInfoRequest.type, params).then(
				r => r.databaseInfo,
				e => {
					client.logFailedRequest(protocol.GetDatabaseInfoRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let createLogin = (ownerUri: string, loginInfo: sqlops.LoginInfo): Thenable<sqlops.CreateLoginResponse> => {
			let params: types.CreateLoginParams = { ownerUri, loginInfo };
			return client.sendRequest(protocol.CreateLoginRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.CreateLoginRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		return sqlops.dataprotocol.registerAdminServicesProvider({
			providerId: client.providerId,
			createDatabase,
			createLogin,
			getDatabaseInfo,
			getDefaultDatabaseInfo
		});
	}
}

export class BackupFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.BackupRequest.type,
		protocol.BackupConfigInfoRequest.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, BackupFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'backup')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;

		let backup = (ownerUri: string, backupInfo: types.BackupInfo, taskExecutionMode: sqlops.TaskExecutionMode): Thenable<sqlops.BackupResponse> => {
			let params: types.BackupParams = { ownerUri, backupInfo, taskExecutionMode };
			return client.sendRequest(protocol.BackupRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.BackupRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let getBackupConfigInfo = (connectionUri: string): Thenable<sqlops.BackupConfigInfo> => {
			let params: types.DefaultDatabaseInfoParams = { ownerUri: connectionUri };
			return client.sendRequest(protocol.BackupConfigInfoRequest.type, params).then(
				r => r.backupConfigInfo,
				e => {
					client.logFailedRequest(protocol.BackupConfigInfoRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		return sqlops.dataprotocol.registerBackupProvider({
			providerId: client.providerId,
			backup,
			getBackupConfigInfo
		});
	}
}

export class RestoreFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.RestorePlanRequest.type,
		protocol.RestoreRequest.type,
		protocol.RestoreConfigInfoRequest.type,
		protocol.CancelRestorePlanRequest.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, RestoreFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'restore')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;

		let getRestorePlan = (ownerUri: string, restoreInfo: sqlops.RestoreInfo): Thenable<sqlops.RestorePlanResponse> => {
			let params: types.RestoreParams = { options: restoreInfo.options, ownerUri, taskExecutionMode: restoreInfo.taskExecutionMode };
			return client.sendRequest(protocol.RestorePlanRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.RestorePlanRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let restore = (ownerUri: string, restoreInfo: sqlops.RestoreInfo): Thenable<sqlops.RestoreResponse> => {
			let params: types.RestoreParams = { options: restoreInfo.options, ownerUri, taskExecutionMode: restoreInfo.taskExecutionMode };
			return client.sendRequest(protocol.RestoreRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.RestoreRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let getRestoreConfigInfo = (ownerUri: string): Thenable<sqlops.RestoreConfigInfo> => {
			let params: types.RestoreConfigInfoRequestParams = { ownerUri };
			return client.sendRequest(protocol.RestoreConfigInfoRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.RestoreConfigInfoRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let cancelRestorePlan = (ownerUri: string, restoreInfo: sqlops.RestoreInfo): Thenable<boolean> => {
			let params: types.RestoreParams = { options: restoreInfo.options, ownerUri, taskExecutionMode: restoreInfo.taskExecutionMode };
			return client.sendRequest(protocol.CancelRestorePlanRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.CancelRestorePlanRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		return sqlops.dataprotocol.registerRestoreProvider({
			providerId: client.providerId,
			cancelRestorePlan,
			getRestoreConfigInfo,
			getRestorePlan,
			restore
		});
	}
}

export class ObjectExplorerFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.ObjectExplorerCreateSessionRequest.type,
		protocol.ObjectExplorerExpandRequest.type,
		protocol.ObjectExplorerRefreshRequest.type,
		protocol.ObjectExplorerCloseSessionRequest.type,
		protocol.ObjectExplorerCreateSessionCompleteNotification.type,
		protocol.ObjectExplorerExpandCompleteNotification.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, ObjectExplorerFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'objectExplorer')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;
		let createNewSession = (connInfo: sqlops.ConnectionInfo): Thenable<sqlops.ObjectExplorerSessionResponse> => {
			return client.sendRequest(protocol.ObjectExplorerCreateSessionRequest.type, connInfo).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.ObjectExplorerCreateSessionRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let expandNode = (nodeInfo: sqlops.ExpandNodeInfo): Thenable<boolean> => {
			return client.sendRequest(protocol.ObjectExplorerExpandRequest.type, nodeInfo).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.ObjectExplorerExpandRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let refreshNode = (nodeInfo: sqlops.ExpandNodeInfo): Thenable<boolean> => {
			return client.sendRequest(protocol.ObjectExplorerRefreshRequest.type, nodeInfo).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.ObjectExplorerRefreshRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let closeSession = (closeSessionInfo: sqlops.ObjectExplorerCloseSessionInfo): Thenable<any> => {
			return client.sendRequest(protocol.ObjectExplorerCloseSessionRequest.type, closeSessionInfo).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.ObjectExplorerCloseSessionRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let registerOnSessionCreated = (handler: (response: sqlops.ObjectExplorerSession) => any): void => {
			client.onNotification(protocol.ObjectExplorerCreateSessionCompleteNotification.type, handler);
		};

		let registerOnExpandCompleted = (handler: (response: sqlops.ObjectExplorerExpandInfo) => any): void => {
			client.onNotification(protocol.ObjectExplorerExpandCompleteNotification.type, handler);
		};

		return sqlops.dataprotocol.registerObjectExplorerProvider({
			providerId: client.providerId,
			closeSession,
			createNewSession,
			expandNode,
			refreshNode,
			registerOnExpandCompleted,
			registerOnSessionCreated
		});
	}
}

export class ScriptingFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.ScriptingRequest.type,
		protocol.ScriptingCompleteNotification.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, ScriptingFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'scripting')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;

		let scriptAsOperation = (connectionUri: string, operation: sqlops.ScriptOperation, metadata: sqlops.ObjectMetadata, paramDetails: sqlops.ScriptingParamDetails): Thenable<sqlops.ScriptingResult> => {
			return client.sendRequest(protocol.ScriptingRequest.type,
				client.sqlc2p.asScriptingParams(connectionUri, operation, metadata, paramDetails)).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.ScriptingRequest.type, e);
					return Promise.resolve(undefined);
				}
				);
		};

		let registerOnScriptingComplete = (handler: (scriptingCompleteResult: sqlops.ScriptingCompleteResult) => any): void => {
			client.onNotification(protocol.ScriptingCompleteNotification.type, handler);
		};

		return sqlops.dataprotocol.registerScriptingProvider({
			providerId: client.providerId,
			registerOnScriptingComplete,
			scriptAsOperation
		});
	}
}

export class TaskServicesFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.ListTasksRequest.type,
		protocol.CancelTaskRequest.type,
		protocol.TaskCreatedNotification.type,
		protocol.TaskStatusChangedNotification.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, TaskServicesFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'taskServices')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;

		let getAllTasks = (listTasksParams: sqlops.ListTasksParams): Thenable<sqlops.ListTasksResponse> => {
			return client.sendRequest(protocol.ListTasksRequest.type, listTasksParams).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.ListTasksRequest.type, e);
					return Promise.resolve(undefined);
				}
			);

		};

		let cancelTask = (cancelTaskParams: sqlops.CancelTaskParams): Thenable<boolean> => {
			return client.sendRequest(protocol.CancelTaskRequest.type, cancelTaskParams).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.CancelTaskRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let registerOnTaskCreated = (handler: (response: sqlops.TaskInfo) => any): void => {
			client.onNotification(protocol.TaskCreatedNotification.type, handler);
		};

		let registerOnTaskStatusChanged = (handler: (response: sqlops.TaskProgressInfo) => any): void => {
			client.onNotification(protocol.TaskStatusChangedNotification.type, handler);
		};

		return sqlops.dataprotocol.registerTaskServicesProvider({
			providerId: client.providerId,
			cancelTask,
			getAllTasks,
			registerOnTaskCreated,
			registerOnTaskStatusChanged
		});
	}
}

export class FileBrowserFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.FileBrowserOpenRequest.type,
		protocol.FileBrowserOpenedNotification.type,
		protocol.FileBrowserExpandRequest.type,
		protocol.FileBrowserExpandedNotification.type,
		protocol.FileBrowserValidateRequest.type,
		protocol.FileBrowserValidatedNotification.type,
		protocol.FileBrowserCloseRequest.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, FileBrowserFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'fileBrowser')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;

		let openFileBrowser = (ownerUri: string, expandPath: string, fileFilters: string[], changeFilter: boolean): Thenable<boolean> => {
			let params: types.FileBrowserOpenParams = { ownerUri, expandPath, fileFilters, changeFilter };
			return client.sendRequest(protocol.FileBrowserOpenRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.FileBrowserOpenRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let registerOnFileBrowserOpened = (handler: (response: sqlops.FileBrowserOpenedParams) => any): void => {
			client.onNotification(protocol.FileBrowserOpenedNotification.type, handler);
		};

		let expandFolderNode = (ownerUri: string, expandPath: string): Thenable<boolean> => {
			let params: types.FileBrowserExpandParams = { ownerUri, expandPath };
			return client.sendRequest(protocol.FileBrowserExpandRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.FileBrowserExpandRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let registerOnFolderNodeExpanded = (handler: (response: sqlops.FileBrowserExpandedParams) => any): void => {
			client.onNotification(protocol.FileBrowserExpandedNotification.type, handler);
		};

		let validateFilePaths = (ownerUri: string, serviceType: string, selectedFiles: string[]): Thenable<boolean> => {
			let params: types.FileBrowserValidateParams = { ownerUri, serviceType, selectedFiles };
			return client.sendRequest(protocol.FileBrowserValidateRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.FileBrowserValidateRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		let registerOnFilePathsValidated = (handler: (response: sqlops.FileBrowserValidatedParams) => any): void => {
			client.onNotification(protocol.FileBrowserValidatedNotification.type, handler);
		};

		let closeFileBrowser = (ownerUri: string): Thenable<sqlops.FileBrowserCloseResponse> => {
			let params: types.FileBrowserCloseParams = { ownerUri };
			return client.sendRequest(protocol.FileBrowserCloseRequest.type, params).then(
				r => r,
				e => {
					client.logFailedRequest(protocol.FileBrowserCloseRequest.type, e);
					return Promise.resolve(undefined);
				}
			);
		};

		return sqlops.dataprotocol.registerFileBrowserProvider({
			providerId: client.providerId,
			closeFileBrowser,
			expandFolderNode,
			openFileBrowser,
			registerOnFileBrowserOpened,
			registerOnFilePathsValidated,
			registerOnFolderNodeExpanded,
			validateFilePaths
		});
	}
}

export class ProfilerFeature extends SqlOpsFeature<undefined> {
	private static readonly messagesTypes: RPCMessageType[] = [
		protocol.StartProfilingRequest.type,
		protocol.StopProfilingRequest.type,
		protocol.ProfilerEventsAvailableNotification.type
	];

	constructor(client: SqlOpsDataClient) {
		super(client, ProfilerFeature.messagesTypes);
	}

	public fillClientCapabilities(capabilities: protocol.ClientCapabilities): void {
		ensure(ensure(capabilities, 'connection')!, 'profiler')!.dynamicRegistration = true;
	}

	public initialize(capabilities: ServerCapabilities): void {
		this.register(this.messages, {
			id: UUID.generateUuid(),
			registerOptions: undefined
		});
	}

	protected registerProvider(options: undefined): Disposable {
		const client = this._client;

		let startSession = (ownerUri: string): Thenable<boolean> => {
			let params: types.StartProfilingParams = {
				ownerUri,
				options: {}
			};

			return client.sendRequest(protocol.StartProfilingRequest.type, params).then(
				r => true,
				e => {
					client.logFailedRequest(protocol.StartProfilingRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let stopSession = (ownerUri: string): Thenable<boolean> => {
			let params: types.StopProfilingParams = {
				ownerUri
			};

			return client.sendRequest(protocol.StopProfilingRequest.type, params).then(
				r => true,
				e => {
					client.logFailedRequest(protocol.StopProfilingRequest.type, e);
					return Promise.reject(e);
				}
			);
		};

		let pauseSession = (sessionId: string): Thenable<boolean> => {
			return undefined;
		};

		let connectSession = (sessionId: string): Thenable<boolean> => {
			return undefined;
		};

		let disconnectSession = (sessionId: string): Thenable<boolean> => {
			return undefined;
		};

		let registerOnSessionEventsAvailable = (handler: (response: sqlops.ProfilerSessionEvents) => any): void => {
			client.onNotification(protocol.ProfilerEventsAvailableNotification.type, (params: types.ProfilerEventsAvailableParams) => {
				handler(<sqlops.ProfilerSessionEvents>{
					sessionId: params.ownerUri,
					events: params.events
				});
			});
		};

		return sqlops.dataprotocol.registerProfilerProvider({
			providerId: client.providerId,
			connectSession,
			disconnectSession,
			pauseSession,
			registerOnSessionEventsAvailable,
			startSession,
			stopSession
		});
	}
}