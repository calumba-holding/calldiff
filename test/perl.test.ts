import { test } from "./expectCallstack.js";

test("perl: refactors calls into a helper with if/else", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      sub create_agent_session {
          my ($options) = @_;
      -   AuthStorage::create();
      -   create_coding_tools();
      +   my $services = get_services;
      +   $services->boot();
          if ($options->{session_id}) {
              SessionManager::open($options->{session_id});
          } else {
              SessionManager::create();
          }
      }

      + sub get_services {
      +     AuthStorage::create();
      +     create_coding_tools();
      + }

      sub create_coding_tools { }

      sub AuthStorage::create { }
      sub SessionManager::create { }
      sub SessionManager::open { my ($id) = @_; }
    `,
    "create_agent_session",
    { file: "pi.pl" },
  ).toEqual(`
      create_agent_session($options)
    - ├─ AuthStorage.create()
    - ├─ create_coding_tools()
    + ├─ get_services()
    + │  ├─ AuthStorage.create()
    + │  └─ create_coding_tools()
    + ├─ services.boot()
      ├─ if $options->{session_id}
         └─ SessionManager.open($id)
      └─ else
         └─ SessionManager.create()
  `);
});

test("perl: $self->method resolves to Package.method", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      package Runner;

      sub start {
          my ($self) = @_;
          $self->prepare();
      +   $self->validate();
          $self->run();
      }

      sub prepare { }
      + sub validate { }
      sub run { }
    `,
    "Runner.start",
    { file: "runner.pm" },
  ).toEqual(`
      Runner.start()
      ├─ Runner.prepare()
    + ├─ Runner.validate()
      └─ Runner.run()
  `);
});

test("perl: qualified dispatch and nested packages resolve to dotted keys", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      package My::App::Base;

      sub init { my ($self) = @_; log_init(); }
      sub log_init { }

      package My::App::Child;

      sub create {
          my ($self) = @_;
      -   $self->setup();
      +   $self->My::App::Base::init();
      +   $self->SUPER::finish();
      +   Util::Log::emit();
      }

      - sub setup { my ($self) = @_; }

      package Util::Log;

      + sub emit { }
    `,
    "Child.create",
    { file: "app.pm" },
  ).toEqual(`
      My.App.Child.create()
    - ├─ My.App.Child.setup()
    + ├─ My.App.Base.init()
    + │  └─ My.App.Base.log_init()
    + ├─ My.App.Child.finish()
    + └─ Util.Log.emit()
  `);
});

test("perl: paren-less, &sigil, and postfix-conditional calls resolve like plain calls", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      sub main_loop {
      -   setup();
      +   setup;
          run_once;
          &init_hooks();
      +   Log::flush;
          cleanup if $done;
      }

      sub setup { }
      sub run_once { }
      sub init_hooks { }
      + sub Log::flush { }
      sub cleanup { }
    `,
    "main_loop",
    { file: "calls.pl" },
  ).toEqual(`
      main_loop()
      ├─ setup()
      ├─ run_once()
      ├─ init_hooks()
    + ├─ Log.flush()
      └─ if $done
         └─ cleanup()
  `);
});

test("perl: indirect-object new matches Class->new; plain new(...) stays a call", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      sub make {
      -   my $w = new Thing(load_config());
      +   my $w = Thing->new(load_config());
      +   register($w);
          new(helper());
      }

      sub load_config { }
      + sub register { }
      sub helper { }

      package Thing;

      sub new {
          my ($class, $config) = @_;
          my $self = bless {}, $class;
          $self->init();
      +   ready() unless $config->{bare};
          return $self;
      }

      sub init { my ($self) = @_; }
      + sub ready { }
    `,
    "make",
    { file: "ctor.pl" },
  ).toEqual(`
      make()
      ├─ new Thing($config)
      │  ├─ Thing.bless()
      │  ├─ Thing.init()
    + │  └─ unless $config->{bare}
    + │     └─ Thing.ready()
      ├─ load_config()
    + ├─ register()
      ├─ new()
      └─ helper()
  `);
});

test("perl: subroutine signatures drive the params label", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      use v5.36;

      sub notify ($user, $message, @tags) {
          format_message($message, @tags);
      +   deliver($user);
      }

      sub format_message ($message, @tags) { }
      + sub deliver ($user) { }
    `,
    "notify",
    { file: "notify.pl" },
  ).toEqual(`
      notify($user, $message, @tags)
      ├─ format_message($message, @tags)
    + └─ deliver($user)
  `);
});

test("perl: shift @_ unpacks conventional params; comments and other arrays do not", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      sub enqueue {
          # take the next job
          my $self = shift;
          my $job = shift @_;
          my $next = shift @queue;
          process($job);
      +   audit($job);
      }

      sub process { my ($job) = @_; }
      + sub audit { my ($job) = @_; }
    `,
    "enqueue",
    { file: "queue.pl" },
  ).toEqual(`
      enqueue($job)
      ├─ process($job)
    + └─ audit($job)
  `);
});

test("perl: package block scopes methods and unless branches", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      package Cache {
          sub get {
              my ($self, $key) = @_;
              unless ($self->{$key}) {
      -           $self->reload($key);
      +           $self->fetch($key);
              }
              return $self->{$key};
          }

      -   sub reload { my ($self, $key) = @_; }
      +   sub fetch { my ($self, $key) = @_; }
      }
    `,
    "Cache.get",
    { file: "cache.pm" },
  ).toEqual(`
      Cache.get($key)
      └─ unless $self->{$key}
    -    ├─ Cache.reload($key)
    +    └─ Cache.fetch($key)
  `);
});

test("perl: 5.38 class methods resolve like package subs", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      use v5.38;
      use experimental 'class';

      class Counter {
          field $count = 0;

          method increment ($by = 1) {
              $self->log_change();
      +       $self->clamp();
          }

          method log_change {
              audit($count);
          }

      +   method clamp { }

          sub audit { my ($value) = @_; }
      }
    `,
    "Counter.increment",
    { file: "counter.pl" },
  ).toEqual(`
      Counter.increment($by)
      ├─ Counter.log_change()
      │  └─ Counter.audit($value)
    + └─ Counter.clamp()
  `);
});

test("perl: elsif chains stay flat; loop bodies attribute to the caller", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      sub handle {
          my ($status, @jobs) = @_;
          if ($status eq 'a') {
              do_a();
          } elsif ($status eq 'b') {
              do_b();
      +       do_extra();
          } else {
              do_other();
          }
          for my $job (@jobs) {
              run_job($job);
          }
      }

      sub do_a { }
      sub do_b { }
      + sub do_extra { }
      sub do_other { }
      sub run_job { my ($job) = @_; }
    `,
    "handle",
    { file: "elsif.pl" },
  ).toEqual(`
      handle($status, @jobs)
      ├─ if $status eq 'a'
         └─ do_a()
      ├─ elsif $status eq 'b'
         ├─ do_b()
    +    └─ do_extra()
      ├─ else
         └─ do_other()
      └─ run_job($job)
  `);
});

test("perl: try/catch/finally and eval as branches", ({ expectCallstack }) => {
  expectCallstack(
    `
      use v5.40;

      sub boot {
          try {
              open_();
          } catch ($e) {
              recover($e);
          } finally {
              close_();
          }
      -   risky();
      +   eval { risky(); };
      +   flush();
      }

      sub open_ { }
      sub recover { my ($e) = @_; }
      sub close_ { }
      sub risky { }
      + sub flush { }
    `,
    "boot",
    { file: "ctrl.pl" },
  ).toEqual(`
      boot()
      ├─ try
         └─ open_()
      ├─ catch
         └─ recover($e)
      ├─ finally
         └─ close_()
    - ├─ risky()
    + ├─ eval
    +    └─ risky()
    + └─ flush()
  `);
});

test("perl: expression-position Try::Tiny stays calls; blocks are callbacks", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      use Try::Tiny;

      sub load_config {
          my $config = try { read_file(); } catch { defaults(); };
      +   validate($config);
          return $config;
      }

      sub read_file { }
      sub defaults { }
      + sub validate { my ($config) = @_; }
    `,
    "load_config",
    { file: "config.pl" },
  ).toEqual(`
      load_config()
      ├─ try()
      ├─ catch()
    + └─ validate($config)
  `);
});

test("perl: anonymous subs and block arguments are callbacks; a lone finally stays a call", ({
  expectCallstack,
}) => {
  expectCallstack(
    `
      sub outer {
          my $handler = sub { hidden(); };
          with_retries { hidden(); } 3;
          my @ready = map { hidden($_) } visible_list();
          finally { hidden(); };
          visible($handler);
      +   also_visible();
      }

      sub hidden { }
      sub with_retries { }
      sub visible_list { }
      sub finally { my ($cb) = @_; }
      sub visible { my ($handler) = @_; }
      + sub also_visible { }
    `,
    "outer",
    { file: "nested.pl" },
  ).toEqual(`
      outer()
      ├─ with_retries()
      ├─ visible_list()
      ├─ finally($cb)
      ├─ visible($handler)
    + └─ also_visible()
  `);
});
