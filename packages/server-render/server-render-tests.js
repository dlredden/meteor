import { Tinytest } from "meteor/tinytest";
import { WebAppInternals } from "meteor/webapp";
import { onPageLoad } from "meteor/server-render";
import { parse } from "parse5";

// convert a stream to a string via promise
function toString(stream) {
  return new Promise((success, fail) => {
    var string = ''
    stream.on('data', function(data) {
      string += data.toString();
    });

    stream.on('end', function() {
      success(string)
    });

    stream.on('error', function(error) {
      fail(error);
    });
  });
}



const skeleton = `
  <h1>Look, Ma... static HTML!</h1>
  <div id="container-2"></div>
  <p>
    <div id="container-1">
    </div>
  </p>`;

Tinytest.addAsync('server-render - boilerplate', function (test, onComplete) {
  const run = async () => {
    // This test is not a very good demonstration of the server-render
    // abstraction. In normal usage, you would call renderIntoElementById
    // and not think about the rest of this stuff. The extra complexity owes
    // to the trickiness of testing this package without using a real
    // browser to parse the resulting HTTP response.

    const realCallback =
      // Use the underlying abstraction to set the static HTML skeleton.
      WebAppInternals.registerBoilerplateDataCallback(
        "meteor/server-render",
        (request, data, arch) => {
          if (request.isServerRenderTest) {
            test.equal(arch, "web.browser");
            test.equal(request.url, "/server-render/test");
            data.body = skeleton;
          }
          return realCallback.call(this, request, data, arch);
        }
      );

    const callback1 = onPageLoad(sink => {
      sink.renderIntoElementById("container-1", "<oyez/>");
    });

    // This callback is async, and that's fine because
    // WebAppInternals.getBoilerplate is able to yield. Internally the
    // webapp package uses a function called getBoilerplateAsync, so the
    // Fiber power-tools need not be involved in typical requests.
    const callback2 = onPageLoad(async sink => {
      sink.renderIntoElementById(
        "container-2",
        (await "oy") + (await "ez")
      );
    });

    try {
      const { start, stream, end } = WebAppInternals.getBoilerplate({
        isServerRenderTest: true,
        browser: { name: "fake" },
        url: "/server-render/test"
      }, "web.browser");


      const body = await toString(stream);
      const boilerplate = start + "\n" + body + "\n" + end;

      const ids = [];
      const seen = new Set;

      function walk(node) {
        if (node && ! seen.has(node)) {
          seen.add(node);

          if (node.nodeName === "div" && node.attrs) {
            node.attrs.some(attr => {
              if (attr.name === "id") {
                const id = attr.value;

                if (id === "container-1") {
                  test.equal(node.childNodes[0].nodeName, "oyez");
                  ids.push(id);
                } else if (id === "container-2") {
                  const child = node.childNodes[0];
                  test.equal(child.nodeName, "#text");
                  test.equal(child.value.trim(), "oyez");
                  ids.push(id);
                }

                return true;
              }
            });
          }

          if (node.childNodes) {
            node.childNodes.forEach(walk)
          }
        }
      }

      walk(parse(boilerplate));

      test.equal(ids, ["container-2", "container-1"]);

    } finally {
      // Cleanup to minimize interference with other tests:
      WebAppInternals.registerBoilerplateDataCallback(
        "meteor/server-render",
        realCallback
      );

      onPageLoad.remove(callback1);
      onPageLoad.remove(callback2);
    }
  }

  run().then(onComplete).catch(console.error);
});
