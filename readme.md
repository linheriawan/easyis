# Plan on making easy app

# Spec
- run on bun
- easy => very high language (easily read to novice programmer)
- concistent structural output 

# Value
- POJO => probably need to adapt as DummiesJavaObject
- DB First, layer Object Definition -> ORM -> class/logic -> REST -> ui
- JSON config

# WebUI Request Flow
-> uri hit -> Authentication -> Authorisation -> LayoutData -> Logic -> Response
                            ├-> Cookie:Identity             -^
                            ├-> LocalStorage:message        -^
                            ├-> LocalStorage:KV_Vars (branches,products) -^
            ├-> Log(console.info,rsyslog,file)
            ├-> Trace Start                                          -> Trace Stop

config_flow=[
  { authentication: {fail:[LocalStorage.messages | 403], success:LocalStorage.messages} },
  { authorisation: {fail:[LocalStorage.messages | 401],  success:LocalStorage.messages} },
  { LayoutData: {Identity:getCookie(), Data:getKV_Vars(), message:getUnread()} },
  { Log:console.info},
  { Log:"path/to/file.log"},
  { TraceStart:"uri/start", TraceStop:"uri/stop" }
]

# Layers
## Foundation
  - Web Server
  - Mechanics: Request - Response, Authentication/Authorisation, Loging
## Business Process 
is one request to an endpoint/uri until it return response.
Illustration:
  Request -> Process -> Response
Requirement:
- Collecting Input: { Request Payload | Load from DB }
- Operation: { Input Arithmetic/TextOperation | DB Operation }
- Formating Output: { Hardcode State | data.Map() }

## Process Flow
request -> response maybe need to execute another Business Process   

# Scafold
lib/
- routes.js
- middleware.js
- viewEngine.js
etc/
- DBDef/
- Logic/
- routeMap.json
- secrets.json
Logic/
- REST api
html/
- home/
