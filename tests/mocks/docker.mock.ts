export interface DockerRunInvocation {
  image: string;
  command: string[];
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export class DockerCliMock {
  readonly invocations: DockerRunInvocation[] = [];

  enqueueRun(invocation: DockerRunInvocation): void {
    this.invocations.push(invocation);
  }

  nextRun(): DockerRunInvocation {
    const invocation = this.invocations.shift();
    if (!invocation) {
      throw new Error("DockerCliMock has no queued run invocation");
    }
    return invocation;
  }
}
