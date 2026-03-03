# SOFTWARE REQUIREMENTS SPECIFICATION

ProjectFlow --- Project Management Platform

Prepared for: CodeUpscale

Version: 1.0

Date: March 2, 2026

Classification: Confidential

CodeUpscale © 2026 --- All Rights Reserved

Table of Contents

# 1. Introduction

## 1.1 Purpose

This Software Requirements Specification (SRS) defines the functional
and non-functional requirements for ProjectFlow, a comprehensive project
management platform designed to replace Jira and similar commercial
tools. ProjectFlow aims to provide full-featured issue tracking, agile
project management, team collaboration, and reporting capabilities as a
self-hosted or cloud-deployed solution for CodeUpscale and its clients.

## 1.2 Scope

ProjectFlow is a web-based project management and issue tracking system
that supports Scrum, Kanban, and hybrid agile methodologies. The system
will serve as the primary tool for software development teams to plan,
track, and deliver projects. Key capabilities include:

-   Issue and task management with customizable workflows

-   Agile boards (Scrum and Kanban) with drag-and-drop functionality

-   Sprint planning, backlog grooming, and velocity tracking

-   Time tracking and workload management

-   Advanced reporting, dashboards, and analytics

-   Role-based access control with multi-tenant support

-   REST API and webhook integrations for CI/CD pipelines

-   Real-time collaboration with notifications and mentions

## 1.3 Definitions and Acronyms

  ------------------ ----------------------------------------------------
  **Term**           **Definition**

  **SRS**            Software Requirements Specification

  **API**            Application Programming Interface

  **RBAC**           Role-Based Access Control

  **SSO**            Single Sign-On

  **CI/CD**          Continuous Integration / Continuous Deployment

  **CRUD**           Create, Read, Update, Delete

  **SPA**            Single Page Application

  **JWT**            JSON Web Token

  **WBS**            Work Breakdown Structure

  **SLA**            Service Level Agreement
  ------------------ ----------------------------------------------------

## 1.4 Document Conventions

Requirements are identified using a hierarchical numbering scheme (e.g.,
FR-AUTH-001). Priority levels are classified as P0 (Critical), P1
(High), P2 (Medium), and P3 (Low). Functional requirements are prefixed
with FR and non-functional requirements with NFR.

## 1.5 References

-   IEEE 830-1998: Recommended Practice for Software Requirements
    Specifications

-   Atlassian Jira Feature Documentation (reference implementation)

-   OWASP Application Security Verification Standard (ASVS) v4.0

-   WCAG 2.1 AA Accessibility Guidelines

# 2. Overall Description

## 2.1 Product Perspective

ProjectFlow is a standalone SaaS/self-hosted product that replaces
commercial project management tools like Jira, Linear, and Asana. It
operates as a multi-tenant web application with a microservices-oriented
backend and a modern SPA frontend. The system integrates with external
services including Git providers (GitHub, GitLab, Bitbucket), CI/CD
tools (Jenkins, GitHub Actions), communication platforms (Slack,
Microsoft Teams), and identity providers (SAML, OAuth 2.0).

## 2.2 Product Features (High-Level)

The platform is organized into the following major feature modules:

-   Authentication and User Management: Registration, SSO, RBAC, team
    management

-   Project Management: Project creation, configuration, templates,
    archiving

-   Issue Tracking: Full lifecycle management of issues, bugs, stories,
    epics, and subtasks

-   Agile Boards: Scrum boards, Kanban boards, sprint management,
    backlog management

-   Workflow Engine: Custom statuses, transitions, automations, and
    rules

-   Time Tracking: Work logging, timesheets, billable hours reporting

-   Reporting and Dashboards: Burndown/burnup charts, velocity,
    cumulative flow, custom dashboards

-   Search and Filtering: Advanced JQL-like query language with saved
    filters

-   Integrations: REST API, webhooks, Git integration, CI/CD,
    Slack/Teams

-   Notifications: In-app, email, push, and \@mention notifications

-   Administration: System settings, audit logs, billing, subscription
    management

## 2.3 User Classes and Characteristics

  ------------- ---------------------- ----------------- -----------------
  **User        **Description**        **Technical       **Frequency**
  Class**                              Level**           

  System Admin  Manages platform,      High              Daily
                tenants, billing, and                    
                global settings                          

  Project Admin Configures projects,   Medium-High       Daily
                workflows,                               
                permissions, and                         
                integrations                             

  Team Lead     Manages sprints,       Medium            Daily
                assigns work, monitors                   
                team progress                            

  Developer     Creates/updates        Medium            Continuous
                issues, logs time,                       
                tracks work                              

  QA Engineer   Reports bugs, manages  Medium            Daily
                test cases, verifies                     
                fixes                                    

  Stakeholder   Views dashboards,      Low-Medium        Weekly
                reports, and roadmaps                    
                (read-heavy access)                      

  API Consumer  External systems       High              Automated
                integrating via REST                     
                API or webhooks                          
  ------------- ---------------------- ----------------- -----------------

## 2.4 Operating Environment

-   Server: Linux-based (Ubuntu 22.04+), Docker/Kubernetes deployment

-   Database: PostgreSQL 15+ (primary), Redis 7+ (caching/sessions),
    Elasticsearch 8+ (search)

-   Backend: Node.js 20+ with TypeScript or Python 3.11+ with FastAPI

-   Frontend: React 18+ with TypeScript, Next.js framework

-   Browsers: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+

-   Mobile: Responsive web design; native apps (iOS 15+, Android 12+) in
    Phase 2

## 2.5 Assumptions and Dependencies

-   Users have stable internet connectivity (minimum 2 Mbps)

-   Email delivery service (SendGrid, AWS SES) is available for
    notifications

-   Object storage (S3/MinIO) is available for file attachments

-   SSL/TLS certificates are provisioned for all environments

-   Third-party OAuth providers (Google, GitHub) maintain their API
    contracts

# 3. Functional Requirements

## 3.1 Authentication and User Management

### 3.1.1 User Registration and Login

The system shall support multiple authentication methods to accommodate
various organizational needs and security requirements.

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  FR-AUTH-001   System shall support email/password   P0             Auth
                registration with email verification                 

  FR-AUTH-002   System shall support OAuth 2.0 login  P0             Auth
                via Google, GitHub, and Microsoft                    

  FR-AUTH-003   System shall support SAML 2.0 SSO for P1             Auth
                enterprise customers                                 

  FR-AUTH-004   System shall enforce configurable     P0             Auth
                password policies (min length,                       
                complexity, rotation)                                

  FR-AUTH-005   System shall support two-factor       P0             Auth
                authentication (TOTP and SMS)                        

  FR-AUTH-006   System shall implement account        P0             Auth
                lockout after configurable failed                    
                login attempts                                       

  FR-AUTH-007   System shall support magic link /     P2             Auth
                passwordless login                                   

  FR-AUTH-008   System shall manage JWT tokens with   P0             Auth
                configurable expiry and refresh                      
                rotation                                             
  ------------- ------------------------------------- -------------- ---------------

### 3.1.2 User Profile and Account Management

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  FR-USER-001   Users shall manage their profile      P1             User
                (avatar, display name, timezone,                     
                language)                                            

  FR-USER-002   Users shall configure personal        P1             User
                notification preferences per channel                 

  FR-USER-003   System shall support user             P0             User
                deactivation/reactivation without                    
                data loss                                            

  FR-USER-004   System shall maintain a complete      P1             User
                audit trail of all user account                      
                changes                                              

  FR-USER-005   Admins shall be able to impersonate   P2             User
                users for support and debugging                      
  ------------- ------------------------------------- -------------- ---------------

### 3.1.3 Teams and Organizations

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  FR-TEAM-001   System shall support multi-tenant     P0             Team
                architecture with complete data                      
                isolation                                            

  FR-TEAM-002   Admins shall create, manage, and      P0             Team
                archive teams within an organization                 

  FR-TEAM-003   System shall support RBAC with        P0             Team
                predefined roles (Admin, Manager,                    
                Member, Viewer) and custom roles                     

  FR-TEAM-004   System shall support granular         P1             Team
                permissions at project, board, and                   
                issue level                                          

  FR-TEAM-005   System shall support SCIM             P2             Team
                provisioning for automated user                      
                management                                           
  ------------- ------------------------------------- -------------- ---------------

## 3.2 Project Management

### 3.2.1 Project CRUD and Configuration

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  FR-PROJ-001   Users shall create projects with      P0             Project
                name, key (unique prefix),                           
                description, and icon                                

  FR-PROJ-002   System shall auto-generate issue keys P0             Project
                using project key prefix (e.g.,                      
                PROJ-123)                                            

  FR-PROJ-003   Project admins shall configure        P1             Project
                project-level settings (lead, default                
                assignee, category)                                  

  FR-PROJ-004   System shall support project          P1             Project
                templates for quick setup (Scrum,                    
                Kanban, Bug Tracking)                                

  FR-PROJ-005   Projects shall be archivable with all P1             Project
                data preserved and restorable                        

  FR-PROJ-006   System shall support project          P2             Project
                categories and tagging for                           
                organization                                         

  FR-PROJ-007   Project admins shall configure custom P0             Project
                fields (text, number, date, dropdown,                
                user picker)                                         
  ------------- ------------------------------------- -------------- ---------------

### 3.2.2 Components and Versions

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  FR-COMP-001   Projects shall support components for P1             Project
                logical grouping (e.g., Frontend,                    
                Backend, API)                                        

  FR-COMP-002   Each component shall have a lead,     P2             Project
                description, and default assignee                    

  FR-VER-001    Projects shall support                P1             Project
                versions/releases with name,                         
                description, start/release dates                     

  FR-VER-002    Versions shall track status           P1             Project
                (Unreleased, Released, Archived) with                
                release notes                                        

  FR-VER-003    Issues shall be linkable to Fix       P1             Project
                Version and Affected Version                         
  ------------- ------------------------------------- -------------- ---------------

## 3.3 Issue Tracking

### 3.3.1 Issue Types and Fields

The issue tracking module is the core of the platform, providing full
lifecycle management for all work items.

  ------------ ------------------------------------- -------------- ---------------
  **ID**       **Requirement**                       **Priority**   **Module**

  FR-ISS-001   System shall support default issue    P0             Issue
               types: Epic, Story, Task, Bug,                       
               Subtask                                              

  FR-ISS-002   Admins shall create custom issue      P1             Issue
               types with unique icons and field                    
               configurations                                       

  FR-ISS-003   Each issue shall have: title,         P0             Issue
               description (rich text), type,                       
               status, priority, assignee, reporter,                
               labels, components, versions, story                  
               points, due date, attachments                        

  FR-ISS-004   Issue descriptions shall support rich P0             Issue
               text editing (Markdown + WYSIWYG)                    
               with image embedding, code blocks,                   
               tables, and \@mentions                               

  FR-ISS-005   System shall support custom fields    P0             Issue
               per issue type (text, number, select,                
               multiselect, date, user, URL)                        

  FR-ISS-006   Issues shall support parent-child     P0             Issue
               relationships (Epic \> Story \>                      
               Subtask)                                             

  FR-ISS-007   Issues shall support linking (blocks, P1             Issue
               is blocked by, duplicates, relates                   
               to, clones)                                          

  FR-ISS-008   System shall support bulk operations  P1             Issue
               (edit, transition, delete, move) on                  
               multiple issues                                      
  ------------ ------------------------------------- -------------- ---------------

### 3.3.2 Issue Activities

  ------------ ------------------------------------- -------------- ---------------
  **ID**       **Requirement**                       **Priority**   **Module**

  FR-ACT-001   Each issue shall maintain a           P0             Issue
               chronological activity stream showing                
               all changes                                          

  FR-ACT-002   Users shall add comments with rich    P0             Issue
               text, \@mentions, and file                           
               attachments                                          

  FR-ACT-003   Comments shall support editing and    P1             Issue
               deletion with audit trail                            

  FR-ACT-004   System shall record all field changes P0             Issue
               with old/new values and timestamp                    

  FR-ACT-005   Users shall be able to watch/unwatch  P1             Issue
               issues to receive update                             
               notifications                                        

  FR-ACT-006   System shall support reactions        P3             Issue
               (emoji) on comments                                  

  FR-ACT-007   Users shall attach files (images,     P0             Issue
               documents, archives) up to 25 MB per                 
               file                                                 
  ------------ ------------------------------------- -------------- ---------------

## 3.4 Workflow Engine

### 3.4.1 Workflow Configuration

  ----------- ------------------------------------- -------------- ---------------
  **ID**      **Requirement**                       **Priority**   **Module**

  FR-WF-001   System shall provide default          P0             Workflow
              workflows (To Do \> In Progress \> In                
              Review \> Done)                                      

  FR-WF-002   Project admins shall create custom    P0             Workflow
              workflows with a visual drag-and-drop                
              editor                                               

  FR-WF-003   Workflows shall support custom        P0             Workflow
              statuses with configurable colors and                
              categories (To Do, In Progress, Done)                

  FR-WF-004   Transitions shall support conditions  P1             Workflow
              (only assignee can transition),                      
              validators (required fields), and                    
              post-functions (auto-assign, send                    
              notification)                                        

  FR-WF-005   Different issue types within a        P1             Workflow
              project may use different workflows                  

  FR-WF-006   System shall validate workflow        P1             Workflow
              integrity (no orphan statuses,                       
              reachable done state)                                
  ----------- ------------------------------------- -------------- ---------------

### 3.4.2 Automation Rules

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  FR-AUTO-001   System shall support trigger-based    P1             Automation
                automation rules (when X happens, do                 
                Y)                                                   

  FR-AUTO-002   Supported triggers: issue created,    P1             Automation
                status changed, field updated,                       
                comment added, sprint started/ended,                 
                scheduled (cron)                                     

  FR-AUTO-003   Supported actions: transition issue,  P1             Automation
                assign user, add label, send                         
                notification, update field, create                   
                subtask, add comment, call webhook                   

  FR-AUTO-004   Automation rules shall support        P2             Automation
                conditional logic (if/else based on                  
                field values)                                        

  FR-AUTO-005   System shall provide an automation    P1             Automation
                audit log showing all triggered                      
                actions                                              

  FR-AUTO-006   Admins shall enable/disable           P1             Automation
                automation rules and view execution                  
                history                                              
  ------------- ------------------------------------- -------------- ---------------

## 3.5 Agile Boards

### 3.5.1 Kanban Board

  ------------ ------------------------------------- -------------- ---------------
  **ID**       **Requirement**                       **Priority**   **Module**

  FR-KAN-001   System shall display issues as cards  P0             Board
               in columns mapped to workflow                        
               statuses                                             

  FR-KAN-002   Users shall drag-and-drop cards       P0             Board
               between columns to transition status                 

  FR-KAN-003   Board shall support configurable WIP  P1             Board
               (Work In Progress) limits per column                 

  FR-KAN-004   Board shall support swimlanes (by     P1             Board
               assignee, priority, epic, or none)                   

  FR-KAN-005   Cards shall display configurable      P1             Board
               fields (assignee avatar, priority,                   
               story points, labels, due date)                      

  FR-KAN-006   Board shall support quick filters     P1             Board
               (assignee, label, type, text search)                 

  FR-KAN-007   Board shall update in real-time when  P0             Board
               other users make changes (WebSocket)                 
  ------------ ------------------------------------- -------------- ---------------

### 3.5.2 Scrum Board and Sprint Management

  ------------ ------------------------------------- -------------- ---------------
  **ID**       **Requirement**                       **Priority**   **Module**

  FR-SCR-001   System shall support sprint creation  P0             Sprint
               with name, goal, start date, and end                 
               date                                                 

  FR-SCR-002   Product owners shall manage the       P0             Sprint
               product backlog with drag-and-drop                   
               prioritization                                       

  FR-SCR-003   Users shall move issues into/out of   P0             Sprint
               sprints via drag-and-drop from                       
               backlog                                              

  FR-SCR-004   System shall calculate sprint         P1             Sprint
               capacity based on team availability                  
               and velocity                                         

  FR-SCR-005   Sprint completion shall prompt to     P0             Sprint
               move incomplete issues to the next                   
               sprint or backlog                                    

  FR-SCR-006   System shall generate sprint burndown P0             Sprint
               chart (remaining effort vs. ideal                    
               line)                                                

  FR-SCR-007   System shall generate sprint velocity P0             Sprint
               chart across last N sprints                          

  FR-SCR-008   System shall support sprint           P2             Sprint
               retrospective notes and action items                 
  ------------ ------------------------------------- -------------- ---------------

## 3.6 Search and Filtering

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  FR-SRCH-001   System shall support full-text search P0             Search
                across issues, comments, and                         
                attachments                                          

  FR-SRCH-002   System shall provide a structured     P1             Search
                query language (PQL --- ProjectFlow                  
                Query Language) similar to Jira JQL                  

  FR-SRCH-003   PQL shall support operators: =, !=,   P1             Search
                \>, \<, \>=, \<=, IN, NOT IN, IS, IS                 
                NOT, CONTAINS, ORDER BY                              

  FR-SRCH-004   Users shall save filters and share    P1             Search
                them with team or organization                       

  FR-SRCH-005   System shall provide a visual filter  P1             Search
                builder as an alternative to PQL                     

  FR-SRCH-006   System shall support quick filters on P1             Search
                boards with real-time result updates                 

  FR-SRCH-007   Search results shall support bulk     P2             Search
                actions (assign, transition, label,                  
                delete)                                              

  FR-SRCH-008   System shall index and make           P0             Search
                searchable: issue fields, comments,                  
                attachment names, and custom fields                  
  ------------- ------------------------------------- -------------- ---------------

## 3.7 Time Tracking

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  FR-TIME-001   Users shall log work time on issues   P0             Time
                with date, duration, and description                 

  FR-TIME-002   System shall track original estimate, P0             Time
                remaining estimate, and time spent                   
                per issue                                            

  FR-TIME-003   System shall provide timesheet view   P1             Time
                showing work logs grouped by day/week                

  FR-TIME-004   Team leads shall view team timesheet  P1             Time
                reports with export capability (CSV,                 
                PDF)                                                 

  FR-TIME-005   System shall support billable vs.     P2             Time
                non-billable time categorization                     

  FR-TIME-006   System shall auto-calculate remaining P1             Time
                estimate when work is logged                         
  ------------- ------------------------------------- -------------- ---------------

## 3.8 Reporting and Dashboards

### 3.8.1 Built-in Reports

  ------------ ------------------------------------- -------------- ---------------
  **ID**       **Requirement**                       **Priority**   **Module**

  FR-RPT-001   Sprint Burndown Chart: Remaining work P0             Report
               vs. ideal line for active sprint                     

  FR-RPT-002   Sprint Burnup Chart: Scope and        P1             Report
               completed work over sprint duration                  

  FR-RPT-003   Velocity Chart: Story points          P0             Report
               completed per sprint over last N                     
               sprints                                              

  FR-RPT-004   Cumulative Flow Diagram: Issue count  P1             Report
               by status over time                                  

  FR-RPT-005   Control Chart: Cycle time and lead    P1             Report
               time for completed issues                            

  FR-RPT-006   Created vs. Resolved Chart: Issue     P1             Report
               inflow vs. outflow over time                         

  FR-RPT-007   Pie Chart reports: Issues by          P1             Report
               priority, type, assignee, status,                    
               component                                            

  FR-RPT-008   Workload report: Distribution of open P1             Report
               issues across team members                           
  ------------ ------------------------------------- -------------- ---------------

### 3.8.2 Custom Dashboards

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  FR-DASH-001   Users shall create personal           P1             Dashboard
                dashboards with drag-and-drop widget                 
                layout                                               

  FR-DASH-002   System shall provide dashboard        P1             Dashboard
                widgets: charts, filter results,                     
                activity stream, sprint progress,                    
                calendar, text/markdown                              

  FR-DASH-003   Dashboards shall be shareable with    P2             Dashboard
                teams and embeddable via iframe                      

  FR-DASH-004   Widgets shall support auto-refresh at P2             Dashboard
                configurable intervals                               

  FR-DASH-005   System shall provide a default        P1             Dashboard
                project dashboard template                           
  ------------- ------------------------------------- -------------- ---------------

## 3.9 Integrations and API

### 3.9.1 REST API

  ------------ ------------------------------------- -------------- ---------------
  **ID**       **Requirement**                       **Priority**   **Module**

  FR-API-001   System shall expose a comprehensive   P0             API
               REST API covering all platform                       
               functionality                                        

  FR-API-002   API shall use JWT or API key          P0             API
               authentication with scoped                           
               permissions                                          

  FR-API-003   API shall support pagination,         P0             API
               sorting, filtering, and field                        
               selection                                            

  FR-API-004   API shall return consistent error     P0             API
               responses with HTTP status codes and                 
               error details                                        

  FR-API-005   System shall provide auto-generated   P1             API
               OpenAPI (Swagger) documentation                      

  FR-API-006   API shall support rate limiting per   P0             API
               API key with configurable thresholds                 
  ------------ ------------------------------------- -------------- ---------------

### 3.9.2 Webhooks and Integrations

  ------------ ------------------------------------- -------------- ---------------
  **ID**       **Requirement**                       **Priority**   **Module**

  FR-INT-001   System shall support configurable     P0             Integration
               outgoing webhooks for all major                      
               events                                               

  FR-INT-002   System shall integrate with Git       P1             Integration
               providers (GitHub, GitLab, Bitbucket)                
               for branch/PR linking and                            
               auto-transitions                                     

  FR-INT-003   System shall integrate with Slack and P1             Integration
               Microsoft Teams for notifications and                
               slash commands                                       

  FR-INT-004   System shall support incoming         P1             Integration
               webhooks for external system triggers                

  FR-INT-005   System shall provide a                P3             Integration
               marketplace/plugin architecture for                  
               community extensions                                 

  FR-INT-006   System shall support Zapier/Make      P2             Integration
               integration via standard webhook API                 
  ------------ ------------------------------------- -------------- ---------------

## 3.10 Notifications

  ------------ ------------------------------------- -------------- ---------------
  **ID**       **Requirement**                       **Priority**   **Module**

  FR-NOT-001   System shall send in-app              P0             Notification
               notifications for watched issues,                    
               \@mentions, and assignments                          

  FR-NOT-002   System shall send email notifications P0             Notification
               with configurable batching (instant,                 
               hourly, daily digest)                                

  FR-NOT-003   System shall support push             P2             Notification
               notifications for mobile and desktop                 

  FR-NOT-004   Users shall configure notification    P1             Notification
               preferences per event type and                       
               channel                                              

  FR-NOT-005   In-app notification center shall show P1             Notification
               read/unread status with                              
               mark-all-as-read                                     

  FR-NOT-006   System shall support \@mention        P0             Notification
               autocomplete in comments and                         
               descriptions                                         
  ------------ ------------------------------------- -------------- ---------------

## 3.11 Administration

  ------------ ------------------------------------- -------------- ---------------
  **ID**       **Requirement**                       **Priority**   **Module**

  FR-ADM-001   System admins shall manage global     P1             Admin
               settings (branding, default language,                
               timezone)                                            

  FR-ADM-002   System shall maintain a comprehensive P0             Admin
               audit log of all administrative                      
               actions                                              

  FR-ADM-003   System shall support data export      P1             Admin
               (JSON, CSV) for compliance and                       
               migration                                            

  FR-ADM-004   System shall support data import from P1             Admin
               Jira (JSON/CSV export format)                        

  FR-ADM-005   Admins shall manage subscription      P2             Admin
               plans and billing (for SaaS                          
               deployment)                                          

  FR-ADM-006   System shall provide system health    P1             Admin
               monitoring dashboard (API response                   
               times, error rates, active users)                    

  FR-ADM-007   System shall support scheduled        P0             Admin
               database backups with point-in-time                  
               recovery                                             
  ------------ ------------------------------------- -------------- ---------------

# 4. Non-Functional Requirements

## 4.1 Performance

  -------------- ------------------------------------- -------------- ---------------
  **ID**         **Requirement**                       **Priority**   **Module**

  NFR-PERF-001   Page load time shall be under 2       P0             Performance
                 seconds for 95th percentile on                       
                 standard broadband                                   

  NFR-PERF-002   API response time shall be under      P0             Performance
                 200ms for 95th percentile for                        
                 standard CRUD operations                             

  NFR-PERF-003   System shall handle 10,000 concurrent P0             Performance
                 users without degradation                            

  NFR-PERF-004   Search queries shall return results   P1             Performance
                 within 500ms for datasets up to 1                    
                 million issues                                       

  NFR-PERF-005   Board rendering shall handle 500+     P1             Performance
                 cards without UI lag                                 

  NFR-PERF-006   Real-time updates (WebSocket) shall   P1             Performance
                 have less than 300ms latency                         

  NFR-PERF-007   File uploads (up to 25MB) shall       P1             Performance
                 complete within 10 seconds on                        
                 standard broadband                                   
  -------------- ------------------------------------- -------------- ---------------

## 4.2 Scalability

  -------------- ------------------------------------- -------------- ---------------
  **ID**         **Requirement**                       **Priority**   **Module**

  NFR-SCAL-001   System shall support horizontal       P0             Scalability
                 scaling via stateless application                    
                 servers                                              

  NFR-SCAL-002   Database shall support read replicas  P1             Scalability
                 for query distribution                               

  NFR-SCAL-003   System shall support up to 100,000    P0             Scalability
                 users per tenant and 10 million                      
                 issues per tenant                                    

  NFR-SCAL-004   File storage shall use distributed    P0             Scalability
                 object storage (S3-compatible) for                   
                 unlimited scaling                                    
  -------------- ------------------------------------- -------------- ---------------

## 4.3 Security

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  NFR-SEC-001   All data in transit shall be          P0             Security
                encrypted using TLS 1.2+                             

  NFR-SEC-002   All sensitive data at rest shall be   P0             Security
                encrypted using AES-256                              

  NFR-SEC-003   Passwords shall be hashed using       P0             Security
                bcrypt or Argon2id with appropriate                  
                work factors                                         

  NFR-SEC-004   System shall pass OWASP Top 10        P0             Security
                vulnerability assessment                             

  NFR-SEC-005   API shall implement rate limiting and P0             Security
                brute-force protection                               

  NFR-SEC-006   System shall support IP allowlisting  P1             Security
                for API and admin access                             

  NFR-SEC-007   All user actions shall be logged in   P0             Security
                an immutable audit trail                             

  NFR-SEC-008   System shall support SOC 2 Type II    P1             Security
                compliance requirements                              
  ------------- ------------------------------------- -------------- ---------------

## 4.4 Reliability and Availability

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  NFR-REL-001   System shall maintain 99.9% uptime    P0             Reliability
                SLA (excluding planned maintenance)                  

  NFR-REL-002   System shall support automated        P0             Reliability
                failover with less than 30 seconds                   
                recovery time                                        

  NFR-REL-003   Database shall support point-in-time  P0             Reliability
                recovery with RPO of less than 1 hour                

  NFR-REL-004   System shall implement graceful       P1             Reliability
                degradation (core features available                 
                if non-critical services fail)                       

  NFR-REL-005   System shall support blue-green or    P1             Reliability
                canary deployments for zero-downtime                 
                updates                                              
  ------------- ------------------------------------- -------------- ---------------

## 4.5 Usability

  ------------- ------------------------------------- -------------- ---------------
  **ID**        **Requirement**                       **Priority**   **Module**

  NFR-USE-001   UI shall be responsive and functional P0             Usability
                on screens from 320px to 4K                          
                resolution                                           

  NFR-USE-002   System shall comply with WCAG 2.1 AA  P1             Usability
                accessibility standards                              

  NFR-USE-003   System shall support keyboard         P1             Usability
                navigation for all primary workflows                 

  NFR-USE-004   System shall support dark mode and    P2             Usability
                light mode themes                                    

  NFR-USE-005   System shall support                  P2             Usability
                internationalization (i18n) with                     
                initial support for English, Arabic,                 
                and Urdu                                             

  NFR-USE-006   New users shall be able to create     P1             Usability
                their first issue within 3 minutes                   
                without training                                     
  ------------- ------------------------------------- -------------- ---------------

## 4.6 Maintainability

  --------------- ------------------------------------- -------------- -----------------
  **ID**          **Requirement**                       **Priority**   **Module**

  NFR-MAINT-001   Codebase shall maintain minimum 80%   P1             Maintainability
                  unit test coverage                                   

  NFR-MAINT-002   System shall use containerized        P0             Maintainability
                  deployment with                                      
                  infrastructure-as-code                               

  NFR-MAINT-003   All API endpoints shall have          P1             Maintainability
                  automated integration tests                          

  NFR-MAINT-004   System shall produce structured       P1             Maintainability
                  logging (JSON) compatible with                       
                  ELK/Datadog                                          

  NFR-MAINT-005   Database migrations shall be          P0             Maintainability
                  versioned and reversible                             
  --------------- ------------------------------------- -------------- -----------------

# 5. Data Requirements

## 5.1 Core Data Model

The following are the primary data entities and their key relationships:

  --------------- --------------------------------- ----------------------
  **Entity**      **Key Attributes**                **Relationships**

  Organization    id, name, slug, plan, settings,   Has many Projects,
                  created_at                        Users

  User            id, email, name, avatar, role,    Belongs to
                  timezone, status                  Organization, Teams

  Project         id, key, name, lead_id, category, Has many Issues,
                  workflow_id, settings             Boards, Sprints

  Issue           id, key, title, description,      Belongs to Project,
                  type, status, priority,           Sprint; Has Subtasks,
                  assignee_id, reporter_id,         Comments, Attachments,
                  story_points, due_date            Work Logs

  Sprint          id, name, goal, start_date,       Belongs to Project;
                  end_date, status                  Has many Issues

  Comment         id, body, author_id, issue_id,    Belongs to Issue, User
                  created_at, updated_at            

  WorkLog         id, issue_id, user_id, duration,  Belongs to Issue, User
                  date, description, billable       

  Workflow        id, name, statuses\[\],           Belongs to Project;
                  transitions\[\]                   Applied to Issues

  Attachment      id, filename, size, mime_type,    Belongs to Issue
                  storage_path, issue_id            

  Notification    id, user_id, type, payload, read, Belongs to User
                  created_at                        
  --------------- --------------------------------- ----------------------

## 5.2 Data Retention and Privacy

-   Active data shall be retained for the lifetime of the tenant
    subscription

-   Deleted issues shall be soft-deleted and recoverable for 30 days

-   Audit logs shall be retained for a minimum of 2 years

-   System shall support GDPR data export and right-to-erasure requests

-   Personal data shall be anonymizable upon user account deletion
    request

-   File attachments of deleted issues shall be purged after 90 days

# 6. System Architecture Overview

## 6.1 High-Level Architecture

ProjectFlow follows a modern layered architecture with the following
major components:

-   Client Layer: React SPA (Next.js) served via CDN, communicating via
    REST API and WebSocket

-   API Gateway: Rate limiting, authentication, request routing, API
    versioning

-   Application Layer: Microservices for core domains (Issues, Projects,
    Auth, Notifications, Search, Automation)

-   Data Layer: PostgreSQL (primary), Redis (cache/sessions/pub-sub),
    Elasticsearch (full-text search)

-   Infrastructure: Docker containers orchestrated via Kubernetes, with
    CI/CD via GitHub Actions

-   External Services: S3 (file storage), SendGrid (email), Stripe
    (billing), OAuth providers

## 6.2 Technology Stack (Recommended)

  ------------------ -------------------------- --------------------------
  **Layer**          **Technology**             **Justification**

  Frontend           React 18+ / Next.js 14+ /  Industry standard, SSR
                     TypeScript                 support, type safety

  UI Components      Tailwind CSS + Radix UI /  Rapid development,
                     shadcn/ui                  accessible, customizable

  State Management   TanStack Query + Zustand   Server state caching,
                                                lightweight client state

  Backend Framework  Node.js 20+ / NestJS /     Shared language with
                     TypeScript                 frontend, strong typing

  Database           PostgreSQL 15+ with        ACID compliance, JSON
                     pgvector                   support, vector search

  Cache/Queue        Redis 7+ / BullMQ          Session management,
                                                caching, job queues

  Search Engine      Elasticsearch 8+ or        Full-text search, faceted
                     Meilisearch                filtering

  Real-time          Socket.io / WebSocket      Board updates,
                                                notifications, presence

  File Storage       AWS S3 / MinIO             Scalable, S3-compatible
                     (self-hosted)              API

  Auth               Passport.js + JWT + SAML   Multi-strategy
                                                authentication

  Containerization   Docker + Kubernetes        Scalable deployment,
                                                service isolation

  CI/CD              GitHub Actions             Integrated with source
                                                control

  Monitoring         Prometheus + Grafana +     Metrics, alerting, error
                     Sentry                     tracking
  ------------------ -------------------------- --------------------------

# 7. Development Environment (Docker)

This section defines the complete Docker-based development environment for ProjectFlow, enabling any developer to spin up the full stack locally with a single command.

## 7.1 Architecture Overview

The dev environment uses Docker Compose to orchestrate all services. Each service runs in its own container, mirroring the production architecture.

```
projectflow/
├── docker-compose.yml
├── docker-compose.override.yml    # Local dev overrides
├── .env.example
├── .env
├── services/
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── Dockerfile.dev
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   ├── web/
│   │   ├── Dockerfile
│   │   ├── Dockerfile.dev
│   │   ├── package.json
│   │   └── src/
│   ├── worker/
│   │   ├── Dockerfile
│   │   └── src/
│   └── nginx/
│       ├── Dockerfile
│       └── nginx.conf
├── scripts/
│   ├── init-db.sh
│   ├── seed-data.sh
│   └── wait-for-it.sh
├── migrations/
└── docs/
```

## 7.2 Docker Compose Configuration

### 7.2.1 Primary `docker-compose.yml`

```yaml
version: "3.9"

services:
  # ─── Reverse Proxy ───
  nginx:
    build: ./services/nginx
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - api
      - web
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── Frontend (Next.js) ───
  web:
    build:
      context: ./services/web
      dockerfile: Dockerfile.dev
    volumes:
      - ./services/web/src:/app/src
      - ./services/web/public:/app/public
      - web_node_modules:/app/node_modules
    environment:
      - NODE_ENV=development
      - NEXT_PUBLIC_API_URL=http://localhost/api
      - NEXT_PUBLIC_WS_URL=ws://localhost/ws
    ports:
      - "3000:3000"
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── Backend API (NestJS) ───
  api:
    build:
      context: ./services/api
      dockerfile: Dockerfile.dev
    volumes:
      - ./services/api/src:/app/src
      - api_node_modules:/app/node_modules
    ports:
      - "4000:4000"
      - "9229:9229"   # Node.js debugger
    environment:
      - NODE_ENV=development
      - PORT=4000
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      - REDIS_URL=redis://redis:6379
      - ELASTICSEARCH_URL=http://elasticsearch:9200
      - JWT_SECRET=${JWT_SECRET}
      - JWT_EXPIRY=15m
      - JWT_REFRESH_EXPIRY=7d
      - S3_ENDPOINT=http://minio:9000
      - S3_BUCKET=${S3_BUCKET}
      - S3_ACCESS_KEY=${MINIO_ROOT_USER}
      - S3_SECRET_KEY=${MINIO_ROOT_PASSWORD}
      - SMTP_HOST=mailhog
      - SMTP_PORT=1025
      - CORS_ORIGIN=http://localhost:3000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      elasticsearch:
        condition: service_healthy
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── Background Worker (BullMQ) ───
  worker:
    build:
      context: ./services/worker
      dockerfile: Dockerfile.dev
    volumes:
      - ./services/worker/src:/app/src
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      - REDIS_URL=redis://redis:6379
      - ELASTICSEARCH_URL=http://elasticsearch:9200
      - S3_ENDPOINT=http://minio:9000
      - SMTP_HOST=mailhog
      - SMTP_PORT=1025
    depends_on:
      - postgres
      - redis
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── PostgreSQL 15 ───
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sh:/docker-entrypoint-initdb.d/init-db.sh
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── Redis 7 ───
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── Elasticsearch 8 ───
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    ports:
      - "9200:9200"
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - xpack.security.enrollment.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── MinIO (S3-Compatible Object Storage) ───
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"    # MinIO Console
    environment:
      - MINIO_ROOT_USER=${MINIO_ROOT_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── MinIO Bootstrap (Create Default Bucket) ───
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD};
      mc mb local/${S3_BUCKET} --ignore-existing;
      mc anonymous set download local/${S3_BUCKET}/public;
      exit 0;
      "
    networks:
      - projectflow-net

  # ─── MailHog (Email Testing) ───
  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"    # SMTP
      - "8025:8025"    # Web UI
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── pgAdmin (Database Management) ───
  pgadmin:
    image: dpage/pgadmin4:latest
    ports:
      - "5050:80"
    environment:
      - PGADMIN_DEFAULT_EMAIL=${PGADMIN_EMAIL}
      - PGADMIN_DEFAULT_PASSWORD=${PGADMIN_PASSWORD}
      - PGADMIN_CONFIG_SERVER_MODE=False
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    depends_on:
      - postgres
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── Redis Commander (Redis GUI) ───
  redis-commander:
    image: rediscommander/redis-commander:latest
    ports:
      - "8081:8081"
    environment:
      - REDIS_HOSTS=local:redis:6379
    depends_on:
      - redis
    networks:
      - projectflow-net
    restart: unless-stopped

  # ─── Bull Board (Job Queue Dashboard) ───
  bull-board:
    image: deadly0/bull-board:latest
    ports:
      - "3100:3000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis
    networks:
      - projectflow-net
    restart: unless-stopped

networks:
  projectflow-net:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  es_data:
  minio_data:
  pgadmin_data:
  web_node_modules:
  api_node_modules:
```

### 7.2.2 Environment Variables (`.env.example`)

```bash
# ─── Database ───
DB_USER=projectflow
DB_PASSWORD=projectflow_dev_2026
DB_NAME=projectflow

# ─── Authentication ───
JWT_SECRET=dev-jwt-secret-change-in-production-min-32-chars
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ─── MinIO / S3 ───
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
S3_BUCKET=projectflow-uploads

# ─── pgAdmin ───
PGADMIN_EMAIL=admin@codeupscale.com
PGADMIN_PASSWORD=admin123

# ─── App Config ───
APP_URL=http://localhost
API_URL=http://localhost:4000
NODE_ENV=development
LOG_LEVEL=debug
```

## 7.3 Service Dockerfiles

### 7.3.1 API Dockerfile (Development)

```dockerfile
# services/api/Dockerfile.dev
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source (volumes override in dev)
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose API + debugger ports
EXPOSE 4000 9229

# Hot-reload with tsx watch + debugger
CMD ["npx", "tsx", "watch", "--inspect=0.0.0.0:9229", "src/main.ts"]
```

### 7.3.2 API Dockerfile (Production)

```dockerfile
# services/api/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
USER appuser
EXPOSE 4000
CMD ["node", "dist/main.js"]
```

### 7.3.3 Web Dockerfile (Development)

```dockerfile
# services/web/Dockerfile.dev
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

### 7.3.4 Nginx Configuration

```nginx
# services/nginx/nginx.conf
upstream api_upstream {
    server api:4000;
}

upstream web_upstream {
    server web:3000;
}

server {
    listen 80;
    server_name localhost;
    client_max_body_size 25M;

    # API routes
    location /api/ {
        proxy_pass http://api_upstream/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://api_upstream/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Frontend
    location / {
        proxy_pass http://web_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Next.js HMR (dev)
    location /_next/webpack-hmr {
        proxy_pass http://web_upstream/_next/webpack-hmr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 7.4 Database Initialization

### 7.4.1 Init Script

```bash
#!/bin/bash
# scripts/init-db.sh
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Fuzzy text search
    CREATE EXTENSION IF NOT EXISTS "btree_gin";     -- GIN index support

    -- Create schemas
    CREATE SCHEMA IF NOT EXISTS app;
    CREATE SCHEMA IF NOT EXISTS audit;

    -- Grant permissions
    GRANT ALL ON SCHEMA app TO $POSTGRES_USER;
    GRANT ALL ON SCHEMA audit TO $POSTGRES_USER;
EOSQL

echo "Database initialized with extensions and schemas."
```

### 7.4.2 Seed Data Script

```bash
#!/bin/bash
# scripts/seed-data.sh
set -e

echo "Running database migrations..."
cd /app && npx prisma migrate deploy

echo "Seeding development data..."
npx tsx scripts/seed.ts

echo "Seed complete. Default credentials:"
echo "  Admin:  admin@codeupscale.com / Admin123!"
echo "  User:   dev@codeupscale.com   / Dev123!"
```

## 7.5 Quick Start Commands

```bash
# ─── First-time setup ───
cp .env.example .env                   # Configure environment
docker compose up -d                   # Start all services
docker compose exec api npm run db:migrate   # Run migrations
docker compose exec api npm run db:seed      # Seed test data

# ─── Daily development ───
docker compose up -d                   # Start stack
docker compose logs -f api web worker  # Tail logs
docker compose down                    # Stop stack

# ─── Useful commands ───
docker compose exec api npx prisma studio           # DB browser at :5555
docker compose exec api npx prisma migrate dev       # Create migration
docker compose exec api npm run test                 # Run tests
docker compose exec api npm run test:e2e             # E2E tests
docker compose exec postgres psql -U projectflow     # Direct DB access
docker compose restart api                           # Restart single service
docker compose up -d --build api                     # Rebuild single service

# ─── Reset everything ───
docker compose down -v               # Stop and remove all volumes
docker compose up -d --build         # Rebuild from scratch
```

## 7.6 Dev Tool Access Points

| Service             | URL                          | Purpose                         |
|---------------------|------------------------------|---------------------------------|
| Web App             | http://localhost              | Frontend (via Nginx)            |
| Web App (Direct)    | http://localhost:3000         | Next.js direct (with HMR)      |
| API Server          | http://localhost:4000         | Backend API direct access       |
| API Docs (Swagger)  | http://localhost:4000/docs    | Auto-generated API docs         |
| pgAdmin             | http://localhost:5050         | PostgreSQL management GUI       |
| Redis Commander     | http://localhost:8081         | Redis data browser              |
| MinIO Console       | http://localhost:9001         | S3-compatible file browser      |
| MailHog             | http://localhost:8025         | Email testing inbox             |
| Bull Board          | http://localhost:3100         | Background job queue dashboard  |
| Elasticsearch       | http://localhost:9200         | Search engine API               |
| Node Debugger       | localhost:9229                | Attach VS Code debugger         |

## 7.7 VS Code Debug Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to API (Docker)",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "address": "localhost",
      "localRoot": "${workspaceFolder}/services/api",
      "remoteRoot": "/app",
      "restart": true,
      "sourceMaps": true,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## 7.8 Minimum System Requirements (Dev Machine)

| Resource | Minimum  | Recommended |
|----------|----------|-------------|
| CPU      | 4 cores  | 8 cores     |
| RAM      | 8 GB     | 16 GB       |
| Disk     | 20 GB    | 50 GB SSD   |
| Docker   | 24.0+    | Latest      |
| OS       | macOS 13+ / Ubuntu 22.04+ / Windows 11 (WSL2) | Same |

## 7.9 Container Resource Limits (Production Reference)

```yaml
# docker-compose.prod.yml resource constraints
services:
  api:
    deploy:
      resources:
        limits:   { cpus: "2.0", memory: 2G }
        reservations: { cpus: "0.5", memory: 512M }
  web:
    deploy:
      resources:
        limits:   { cpus: "1.0", memory: 1G }
        reservations: { cpus: "0.25", memory: 256M }
  postgres:
    deploy:
      resources:
        limits:   { cpus: "2.0", memory: 2G }
        reservations: { cpus: "0.5", memory: 512M }
  redis:
    deploy:
      resources:
        limits:   { cpus: "0.5", memory: 512M }
        reservations: { cpus: "0.1", memory: 128M }
  elasticsearch:
    deploy:
      resources:
        limits:   { cpus: "2.0", memory: 2G }
        reservations: { cpus: "0.5", memory: 1G }
  worker:
    deploy:
      resources:
        limits:   { cpus: "1.0", memory: 1G }
        reservations: { cpus: "0.25", memory: 256M }
```

---

# 8. Phased Delivery Plan

Development is organized into four phases to enable incremental delivery
and early value realization:

## 8.1 Phase 1: Core Platform (Months 1--4)

Deliver the minimum viable product with essential project management
functionality.

-   User authentication (email/password, OAuth, 2FA)

-   Organization and team management with RBAC

-   Project creation and configuration with custom fields

-   Full issue CRUD with comments, attachments, and activity log

-   Basic Kanban board with drag-and-drop

-   Basic search and filtering

-   Email notifications

-   REST API (core endpoints)

## 8.2 Phase 2: Agile and Workflow (Months 5--7)

-   Scrum board and sprint management

-   Custom workflow engine with visual editor

-   Backlog management and prioritization

-   Sprint burndown and velocity charts

-   Time tracking and work logging

-   Saved filters and PQL query language

## 8.3 Phase 3: Advanced Features (Months 8--10)

-   Automation rules engine

-   Custom dashboards with widgets

-   Advanced reporting (cumulative flow, control chart, workload)

-   Git integration (GitHub, GitLab, Bitbucket)

-   Slack and Teams integration

-   Webhook system

-   Jira data import tool

## 8.4 Phase 4: Enterprise and Scale (Months 11--12)

-   SAML SSO and SCIM provisioning

-   Advanced admin panel and audit logs

-   Multi-region deployment support

-   Plugin/marketplace architecture

-   Mobile-responsive optimization

-   Performance optimization and load testing

-   SOC 2 compliance preparation

# 9. Cost-Benefit Analysis

This section outlines the estimated savings by building ProjectFlow as a
replacement for Jira.

## 9.1 Current Jira Costs

  ----------------------------------- -----------------------------------
  **Item**                            **Monthly Cost**

  Jira Software (current              \$600/month
  subscription)                       

  Annual Jira cost                    \$7,200/year

  5-year projected Jira cost (with    \~\$44,000
  \~10% annual increase)              
  ----------------------------------- -----------------------------------

## 9.2 ProjectFlow Hosting Costs (Estimated)

  ----------------------------------- -----------------------------------
  **Infrastructure Component**        **Monthly Cost**

  VPS / Cloud Server (4 vCPU, 8GB     \$40--\$80
  RAM)                                

  Managed PostgreSQL                  \$15--\$50

  Redis (managed)                     \$10--\$25

  Object Storage (S3/MinIO)           \$5--\$15

  Email Service (SendGrid)            \$0--\$15

  Domain + SSL                        \$5--\$10

  **Estimated Total**                 **\$75--\$195/month**
  ----------------------------------- -----------------------------------

## 9.3 Net Savings

By self-hosting ProjectFlow, monthly savings range from \$400 to \$525
per month, or approximately \$4,800 to \$6,300 per year. Over 5 years,
cumulative savings (accounting for Jira price increases) are projected
at \$25,000 to \$35,000. Additionally, ProjectFlow can be offered as a
product to CodeUpscale clients, creating a potential new revenue stream.

# 10. Acceptance Criteria

The following criteria must be met for each phase delivery to be
considered complete:

-   All P0 requirements for the phase are implemented and pass QA
    testing

-   API endpoints achieve 95%+ automated test coverage

-   No P0 or P1 bugs remain open at phase completion

-   Performance benchmarks (Section 4.1) are met under load testing

-   Security scan (OWASP ZAP or equivalent) shows no critical/high
    vulnerabilities

-   User acceptance testing (UAT) sign-off from at least 3 internal team
    members

-   API documentation is complete and accurate for all released
    endpoints

-   Deployment documentation and runbooks are updated

# 11. Appendix

## 11.1 Requirement Summary

Total requirements defined in this SRS:

  ----------------------- ----------------------- -----------------------
  **Category**            **Count**               **P0 Count**

  Authentication & Users  18                      10

  Project Management      12                      3

  Issue Tracking          15                      7

  Workflow & Automation   12                      3

  Agile Boards & Sprints  15                      6

  Search & Filtering      8                       2

  Time Tracking           6                       2

  Reporting & Dashboards  13                      2

  Integrations & API      12                      5

  Notifications           6                       3

  Administration          7                       2

  Non-Functional          28                      15
  ----------------------- ----------------------- -----------------------

**Total Functional Requirements:** 112

**Total Non-Functional Requirements:** 28

**Grand Total:** 140 requirements

## 11.2 Document Revision History

  ------------- ------------ ----------------------- -----------------------
  **Version**   **Date**     **Author**              **Changes**

  1.0           2026-03-02   CodeUpscale             Initial SRS release
  ------------- ------------ ----------------------- -----------------------

*--- End of Document ---*
