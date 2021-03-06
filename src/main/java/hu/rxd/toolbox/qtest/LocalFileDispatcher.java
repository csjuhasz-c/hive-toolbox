package hu.rxd.toolbox.qtest;

import java.io.InputStream;
import java.net.URL;
import java.util.function.Function;

public class LocalFileDispatcher implements IInputStreamDispatcher {

  protected URL url;

  public LocalFileDispatcher(URL url) {
    this.url = url;
  }

  @Override
  public void visit(Function<InputStream, Void> function) throws Exception {
    handleArchives(url, function);
  }

  protected void handleArchives(URL url, Function<InputStream, Void> function) throws Exception {
    if (url.getFile().endsWith("zip")) {
      new ZipXL(url).visit(function);
      return;
    }
    if (url.getFile().endsWith("tar.gz")) {
      new TarGzXL(url).visit(function);
      return;
    }
    throw new RuntimeException("unable to handle contents of: " + url);
  }
}
