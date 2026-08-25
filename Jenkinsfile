def app

pipeline {
    agent any
    environment {
        ENV_TYPE = "production"
        PORT = 4401
        NAMESPACE = "sprak-by-ru"
        REGISTRY_HOSTNAME = "alhmdd2405"
        PROJECT = "nest-backend"
        REGISTRY = "registry.hub.docker.com"
        DEPLOYMENT_NAME = "nest-backend-deployment"
        IMAGE_NAME = "${env.BUILD_ID}_${env.ENV_TYPE}_${env.GIT_COMMIT}"
        DOCKER_BUILD_NAME = "${env.REGISTRY_HOSTNAME}/${env.PROJECT}:${env.IMAGE_NAME}"
        // corepack из образа агента может быть старше ключей, которыми подписаны
        // свежие релизы pnpm; переменная гасит его интерактивный вопрос, иначе
        // сборка зависнет на приглашении.
        COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
    }

    stages {
        stage('Clone repository') {
            steps {
                checkout scm
            }
        }
        stage('Install dependencies') {
            steps {
                script {
                    // Клиент Prisma генерируется в src/generated и в git не
                    // коммитится — без генерации тесты падают на импорте.
                    // `prisma generate` в базу не ходит, URL нужен ему только
                    // формально.
                    sh '''
                       export NVM_DIR="$HOME/.nvm"
                       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                       nvm use --lts
                       npm install -g corepack@latest
                       corepack enable
                       pnpm install --frozen-lockfile
                       DIRECT_URL="postgresql://build:build@localhost:5432/build" pnpm db:generate
                    '''
                }
            }
        }
        stage('Unit tests') {
            steps {
                script {
                    sh '''
                       export NVM_DIR="$HOME/.nvm"
                       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                       nvm use --lts
                       pnpm test
                    '''
                }
            }
        }
        stage('e2e tests') {
            environment {
                // test/app.e2e-spec.ts поднимает настоящий AppModule, а
                // PrismaService делает getOrThrow('DATABASE_URL') — без
                // переменной стадия падает на старте модуля.
                DATABASE_URL = credentials('neon-database-url')
            }
            steps {
                script {
                    sh '''
                       export NVM_DIR="$HOME/.nvm"
                       [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                       nvm use --lts
                       pnpm test:e2e
                    '''
                }
            }
        }
        stage('Build docker image') {
            when { branch 'main' }
            steps {
                echo "Build image started..."
                    script {
                        app = docker.build("${env.DOCKER_BUILD_NAME}")
                    }
                echo "Build image finished..."
            }
        }
        stage('Push docker image') {
             when { branch 'main' }
             steps {
                 echo "Push image started..."
                     script {
                        docker.withRegistry("https://${env.REGISTRY}", 'sprak-by-ru') {
                            app.push("${env.IMAGE_NAME}")
                        }
                     }
                 echo "Push image finished..."
             }
       }
       stage('Delete image local') {
             when { branch 'main' }
             steps {
                 script {
                    sh "docker rmi -f ${env.DOCKER_BUILD_NAME}"
                 }
             }
        }
        stage('Preparing deployment') {
             when { branch 'main' }
             steps {
                 echo "Preparing started..."
                     sh 'ls -ltr'
                     sh 'pwd'
                     sh "chmod +x preparingDeploy.sh"
                     sh "./preparingDeploy.sh ${env.REGISTRY_HOSTNAME} ${env.PROJECT} ${env.IMAGE_NAME} ${env.DEPLOYMENT_NAME} ${env.PORT} ${env.NAMESPACE}"
                     sh "cat deployment.yaml"
             }
        }
        stage('Deploy to Kubernetes') {
             when { branch 'main' }
             steps {
                 withKubeConfig([credentialsId: 'prod-kubernetes']) {
                    sh 'kubectl apply -f deployment.yaml'
                    sh "kubectl rollout status deployment/${env.DEPLOYMENT_NAME} --namespace=${env.NAMESPACE}"
                    sh "kubectl get services -o wide"
                 }
             }
        }
    }
}
