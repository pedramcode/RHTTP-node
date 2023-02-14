import { RedisClusterType, createClient } from 'redis';
import { randomBytes } from "crypto";

export type HttpMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'CONNECT'
  | 'OPTIONS'
  | 'TRACE'
  | 'PATCH';

export interface RequestType {
  type: 'request',
  method: HttpMethod;
  path: string;
  headers: { [key: string]: string };
  query: { [key: string]: string };
  body: string;
}

export interface ResponseType {
  type: 'response',
  statusCode: number;
  statusMessage: string;
  headers: { [key: string]: string };
  body: string;
}

function httpParseMessage(rawMessage: string): RequestType | ResponseType {
  const lines = rawMessage.split('\r\n');

  if (lines[0].startsWith('HTTP')) {
    // @ts-ignore
    const response: ResponseType = {
      statusCode: parseInt(lines[0].split(' ')[1]),
      statusMessage: lines[0].split(' ')[2],
      headers: {},
      body: '',
      type: 'response',
    };

    let bodyStarted = false;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '') {
        bodyStarted = true;
        continue;
      }

      if (bodyStarted) {
        response.body += lines[i];
        continue;
      }

      const header = lines[i].split(':');
      response.headers[header[0].trim()] = header[1].trim();
    }

    return response;
  } else {
    // @ts-ignore
    const request: RequestType = {
      // @ts-ignore
      method: lines[0].split(' ')[0],
      path: lines[0].split(' ')[1],
      headers: {},
      query: {},
      body: '',
      type: 'request',
    };

    let bodyStarted = false;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '') {
        bodyStarted = true;
        continue;
      }

      if (bodyStarted) {
        request.body += lines[i];
        continue;
      }

      const header = lines[i].split(':');
      request.headers[header[0].trim()] = header[1].trim();
    }

    const queryString = request.path.split('?')[1];
    if (queryString) {
      const queryParams = queryString.split('&');
      for (const queryParam of queryParams) {
        const keyValue = queryParam.split('=');
        request.query[keyValue[0]] = keyValue[1];
      }
    }

    return request;
  }
}

function httpSerializeMessage(
  message: RequestType | ResponseType,
): string {
  let rawMessage = '';
  if ('statusCode' in message) {
    rawMessage = `HTTP/1.1 ${message.statusCode} ${message.statusMessage}\r\n`;
  } else {
    rawMessage = `${message.method} ${message.path} HTTP/1.1\r\n`;
  }

  for (const header in message.headers) {
    rawMessage += `${header}: ${message.headers[header]}\r\n`;
  }

  rawMessage += '\r\n';
  rawMessage += message.body;

  return rawMessage;
}

function getHTTPStatusMessage(statusCode: number): string {
  switch (statusCode) {
    case 100:
      return 'Continue';
    case 101:
      return 'Switching Protocols';
    case 200:
      return 'OK';
    case 201:
      return 'Created';
    case 202:
      return 'Accepted';
    case 203:
      return 'Non-Authoritative Information';
    case 204:
      return 'No Content';
    case 205:
      return 'Reset Content';
    case 206:
      return 'Partial Content';
    case 300:
      return 'Multiple Choices';
    case 301:
      return 'Moved Permanently';
    case 302:
      return 'Found';
    case 303:
      return 'See Other';
    case 304:
      return 'Not Modified';
    case 305:
      return 'Use Proxy';
    case 307:
      return 'Temporary Redirect';
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 402:
      return 'Payment Required';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 405:
      return 'Method Not Allowed';
    case 406:
      return 'Not Acceptable';
    case 407:
      return 'Proxy Authentication Required';
    case 408:
      return 'Request Timeout';
    case 409:
      return 'Conflict';
    case 410:
      return 'Gone';
    case 411:
      return 'Length Required';
    case 412:
      return 'Precondition Failed';
    case 413:
      return 'Request Entity Too Large';
    case 414:
      return 'Request-URI Too Long';
    case 415:
      return 'Unsupported Media Type';
    case 416:
      return 'Requested Range Not Satisfiable';
    case 417:
      return 'Expectation Failed';
    case 500:
      return 'Internal Server Error';
    case 501:
      return 'Not Implemented';
    case 502:
      return 'Bad Gateway';
    case 503:
      return 'Service Unavailable';
    case 504:
      return 'Gateway Timeout';
    case 505:
      return 'HTTP Version Not Supported';
    default:
      return 'Unknown Status';
  }
}

export class Response {
  data: ResponseType = {
    type: 'response',
    body: '',
    headers: {
      'Content-Length': '0',
    },
    statusCode: 200,
    statusMessage: getHTTPStatusMessage(200),
  };
  request: RequestType;

  constructor(req: RequestType) {
    this.request = req;
  }

  status(code: number): Response {
    this.data.statusCode = code;
    this.data.statusMessage = getHTTPStatusMessage(code);
    return this;
  }

  contentType(type: string): Response {
    this.data.headers['Content-Type'] = type;
    return this;
  }

  header(headers: {[key:string]: string}): Response {
    this.data.headers = {...this.data.headers, ...headers};
    return this;
  }

  send(body: string): string {
    this.data.body = body;
    this.data.headers['Content-Length'] = body.length.toString();
    this.data.headers['X-Socket-ID'] = this.request.headers['X-Socket-ID'];
    return httpSerializeMessage(this.data);
  }
}

export function response(req: RequestType): Response {
  return new Response(req);
}

export type RequestHandlerType = (req: RequestType, res: Response) => string;

export interface EndpointType {
  path: string,
  method: HttpMethod,
  handler: RequestHandlerType,
}

export class RHTTPServer {
  redis_host: string;
  redis_port: number;
  server_name?: string;
  server_desc?: string;
  endpoints: Array<EndpointType>;

  private randomName() {
    const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    let result = "";
    for (let i = 0; i < 20; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  constructor(host: string, port: number, server_name?: string, server_desc?: string) {
    this.redis_host = host;
    this.redis_port = port;
    this.endpoints = new Array<EndpointType>();
    this.server_name = server_name?server_name:this.randomName();
    this.server_desc = server_desc?server_desc:"NODEJS";
  }

  private add_endpoint(method: HttpMethod, path: string, handler: RequestHandlerType): void {
    this.endpoints.push({
      method: method,
      handler: handler,
      path: path,
    });
  }

  get(path: string, handler: RequestHandlerType): void {
    this.add_endpoint('GET', path, handler);
  }

  post(path: string, handler: RequestHandlerType): void {
    this.add_endpoint('POST', path, handler);
  }

  head(path: string, handler: RequestHandlerType): void {
    this.add_endpoint('HEAD', path, handler);
  }

  put(path: string, handler: RequestHandlerType): void {
    this.add_endpoint('PUT', path, handler);
  }

  delete(path: string, handler: RequestHandlerType): void {
    this.add_endpoint('DELETE', path, handler);
  }

  connect(path: string, handler: RequestHandlerType): void {
    this.add_endpoint('CONNECT', path, handler);
  }

  options(path: string, handler: RequestHandlerType): void {
    this.add_endpoint('OPTIONS', path, handler);
  }

  trace(path: string, handler: RequestHandlerType): void {
    this.add_endpoint('TRACE', path, handler);
  }

  patch(path: string, handler: RequestHandlerType): void {
    this.add_endpoint('PATCH', path, handler);
  }

  async listen(callback?: (err: string | undefined) => void | undefined) {
    const client = await createClient({
      url: `redis://${this.redis_host}:${this.redis_port}`,
    });
    client.on('error', err => {
      if (callback) callback(err);
    });
    await client.connect();
    const sub_client = client.duplicate();
    await sub_client.connect();
    sub_client.on('error', err => {
      if (callback) callback(err);
    });
    if (callback) callback('Server is listening to request pipe');

    const listener = (message: string, channel: string) => {
      if (channel === 'REQUEST_PIPE') {
        let req_raw = httpParseMessage(message);
        if (req_raw.type !== 'request') return;
        let req: RequestType = req_raw as RequestType;

        let res = '';
        this.endpoints.forEach(endpoint => {
          if (endpoint.path == req.path && endpoint.method == req.method) {
            res = endpoint.handler(req, response(req));
          }
        });
        if (!res || res.length <= 0){
          client.publish("REJECT_PIPE", req.headers["X-Socket-ID"]);
          return;
        }
        client.publish('RESPONSE_PIPE', res);
      } else if (channel === 'HEARTBEAT') {
        client.publish('ACKNOWLEDGE_PIPE', this.server_name + String.fromCharCode(14) + this.server_desc);
      }
    };
    await sub_client.subscribe(['REQUEST_PIPE', 'HEARTBEAT'], listener);
  }
}
