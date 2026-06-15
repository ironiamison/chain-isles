import WebSocket from '../websocket';
import Connection from '../connection';
import StaticServer from '../static';
import { handleMarketplaceRequest } from '../../controllers/marketplace';
import { handleDisplayNameRequest } from '../../controllers/wallet-profile';
import { getOnchainHealth } from '../../util/onchain-health';

import log from '@kaetram/common/util/log';
import config from '@kaetram/common/config';
import Utils from '@kaetram/common/util/utils';
import { Modules } from '@kaetram/common/network';
import { App, DISABLED } from 'uws';

import type SocketHandler from '../sockethandler';
import type { HeaderWebSocket } from '../connection';
import type { WebSocket as WS, HttpRequest, HttpResponse, us_socket_context_t } from 'uws';
import type { ConnectionInfo } from '@kaetram/common/types/network';

export default class UWS extends WebSocket {
    private staticServer = new StaticServer();

    public constructor(socketHandler: SocketHandler) {
        super(config.host, config.port, socketHandler);

        App({})
            .get('/api/status', (response) => {
                response.cork(() => {
                    response
                        .writeStatus('200 OK')
                        .writeHeader('Content-Type', 'application/json; charset=utf-8')
                        .writeHeader('Cache-Control', 'no-store')
                        .writeHeader('Access-Control-Allow-Origin', '*')
                        .end(
                            JSON.stringify({
                                name: config.name,
                                playerCount: this.socketHandler.getPopulation(),
                                maxPlayers: config.maxPlayers,
                                onchain: getOnchainHealth(),
                                database: {
                                    enabled: !config.skipDatabase,
                                    connected:
                                        this.socketHandler.world?.database?.connected() ?? false
                                },
                                stimulus: this.socketHandler.stimulus?.getPublicInfo() ?? {
                                    enabled: false
                                }
                            })
                        );
                });
            })
            .post('/api/marketplace/sync-gold', (response, request) =>
                this.handleJsonPost(response, request, (body) =>
                    handleMarketplaceRequest(
                        this.socketHandler.marketplace,
                        '/api/marketplace/sync-gold',
                        body
                    )
                )
            )
            .options('/api/marketplace/sync-gold', (response) => {
                this.writeOptions(response);
            })
            .post('/api/wallet/display-name', (response, request) =>
                this.handleJsonPost(response, request, (body) =>
                    handleDisplayNameRequest(this.socketHandler.world, body)
                )
            )
            .options('/api/wallet/display-name', (response) => {
                this.writeOptions(response);
            })
            .get('/*', (response, request) => this.staticServer.handle(response, request))
            .ws('/*', {
                compression: DISABLED,
                idleTimeout: 15,
                maxPayloadLength: 32 * 1024 * 1024,

                upgrade: this.handleUpgrade.bind(this),
                open: this.handleConnection.bind(this),
                message: this.handleMessage.bind(this),
                close: this.handleClose.bind(this)
            })
            .listen(config.port, (socket: WS<ConnectionInfo>) => {
                if (!socket) throw new Error(`Failed to listen on port ${config.port}`);

                this.initializedCallback?.();
            });
    }

    /**
     * Upgrades the HTTP connection to a WebSocket connection. We use this
     * to extract the reverse proxy IP address through the headers.
     */

    private handleUpgrade(
        response: HttpResponse,
        request: HttpRequest,
        context: us_socket_context_t
    ): void {
        response.upgrade(
            {
                url: request.getUrl(),
                remoteAddress: request.getHeader('cf-connecting-ip')
            },
            request.getHeader('sec-websocket-key'),
            request.getHeader('sec-websocket-protocol'),
            request.getHeader('sec-websocket-extensions'),
            context
        );
    }

    /**
     * Handles the creation and organizing of a socket. With UWS we store the instance
     * into the socket's user data so that we can identify the socket later on.
     * @param socket The socket that the connection will be created for.
     */

    private handleConnection(socket: WS<ConnectionInfo>): void {
        let instance = Utils.createInstance(Modules.EntityType.Player),
            connection = new Connection(instance, socket as HeaderWebSocket);

        socket.getUserData().instance = instance;

        this.addCallback?.(connection);
    }

    /**
     * Responsible for converting the buffer into a string and then parsing it into JSON.
     * @param socket The socket that the message was received from (used to identify the connection).
     * @param data Contains buffer data that we convert into a string.
     */

    private handleMessage(socket: WS<ConnectionInfo>, data: ArrayBuffer): void {
        let connection = this.socketHandler.get(socket.getUserData().instance);

        // Prevent the server from crashing if the connection is not found.
        if (!connection)
            return log.error(`No connection found for ${socket.getUserData().instance}`);

        // Increment the rate for the connection.
        connection.messageRate++;

        // Reject the connection once we reach the rate limit threshold.
        if (connection.messageRate > config.messageLimit) return connection.reject('ratelimit');

        try {
            // Convert the buffer into a string.
            let message = new TextDecoder().decode(data);

            // Prevent duplicates in a short period of time.
            if (connection.isDuplicate(message)) return;

            // Pass the parsed JSON onto the message handler.
            connection.messageCallback?.(JSON.parse(message));
        } catch (error) {
            log.error(`Message could not be parsed: ${new TextDecoder().decode(data)}.`);
            log.error(error);
        }
    }

    /**
     * Handles closing the socket and removing our connection from the handler.
     * @param socket The socket that we are closing (used to identify the connection).
     */

    private handleClose(socket: WS<ConnectionInfo>): void {
        let connection = this.socketHandler.get(socket.getUserData().instance);

        if (!connection)
            return log.error(`No connection found closing ${socket.getUserData().instance}`);

        // Mark the connection as closed to prevent any further messages from being sent.
        connection.closed = true;

        this.socketHandler.remove(connection.instance);

        connection.handleClose();
    }

    private writeOptions(response: HttpResponse): void {
        response.cork(() => {
            response
                .writeStatus('204 No Content')
                .writeHeader('Access-Control-Allow-Origin', '*')
                .writeHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
                .writeHeader('Access-Control-Allow-Headers', 'Content-Type')
                .end('');
        });
    }

    private handleJsonPost(
        response: HttpResponse,
        request: HttpRequest,
        handler: (body: string) => Promise<{ status: number; body: string }>
    ): void {
        let chunks: Buffer[] = [];

        response.onAborted(() => {
            chunks = [];
        });

        response.onData((chunk, isLast) => {
            chunks.push(Buffer.from(chunk));

            if (!isLast) return;

            let body = Buffer.concat(chunks).toString('utf8');

            void handler(body).then(({ status, body: payload }) => {
                response.cork(() => {
                    response
                        .writeStatus(`${status}`)
                        .writeHeader('Content-Type', 'application/json; charset=utf-8')
                        .writeHeader('Access-Control-Allow-Origin', '*')
                        .end(payload);
                });
            });
        });
    }
}
