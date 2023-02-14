# RHTTP-node

RHTTP NodeJS interface

## Usage

First create RHTTP server and pass redis host and port to it

```ts
const server = new RHTTPServer("127.0.0.1", 6379);
```

The `RHTTPServer` class have a function for every HTTP method. Each method function has two parameters:

1. **Path**: It's the path of endpoint
2. **Callback**: It's callback function to handling requests

```ts
server.get('/', (req, res) => {
  const response_data = {
    msg: 'Hello User!',
  };
  return res.status(200).contentType('application/json').send(JSON.stringify(response_data));
});
```

The `Callback` parameter is a function with two parameters:

* **request**: Contains HTTP request data such as body, query params, etc.
* **response**: An instance of `Response` class that you can modify and send response to user using it.

### Response methods:

* **status**: Sets HTTP status code and status message
  * `res.status(200)`
* **contentType**: Sets HTTP content type
  * `res.contentType("application/json")`
* **header**: Append HTTP header to response
  * `res.header({"X-Custom-Header": "Header Value"})`
* **send**: Finalizes response progress and make HTTP response string
  * `res.status(200).contentType('application/json').send(JSON.stringify(response_data))`

> **Note** 
> You need to return `send()` method result to callback function to continue progress.

At the end server needs to listen to Redis for receiving incoming requests:

```ts
server.listen((err) => {
  if (err) {
    console.error(err);
  } else {
    console.info('Server is ready');
  }
});
```

## License
This project is licensed under the terms of the MIT License. See the [LICENSE](LICENSE.txt) file for details.